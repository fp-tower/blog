+++
title = "Introducing error reporting in optics"
image = "error-reporting.jpg"
author = "julien truffaut"
tags = ["scala", "monocle"]
date = 2020-01-27T00:00:00+00:00
course = "Scala Foundation"
+++

A frequently requested feature is the ability to report why an optic failed. It is particularly crucial when you build a 
sophisticated optic. Say you have a large configuration document, and you want to focus on `kafka.topics.order-events.partitions`. 
There may not be a `partitions` key, or if it exists, it may have an unexpected format, e.g. it is a String instead of an Int. 
In [Monocle](https://julien-truffaut.github.io/Monocle/) and other optics libraries, we currently cannot provide any details about 
the failure. In this blog post, I will discuss my experiments with a new optics encoding that supports detailed error reporting. 
In particular, I will present a step-by-step refactoring of one specific type of optic such as you can see the intermediate 
attempts as well as the final solution.

This article is written using [Dotty](https://dotty.epfl.ch/) `0.21.0-RC1`. All code is available in the following GitHub
[repository](https://github.com/julien-truffaut/blog-error-reporting/tree/master/src/main/scala/optics).

## Overview of Optional

An `Optional` (aka Affine Traversal) is an optics used to access a section (`To`) of a larger object (`From`). 
As the name implies, the area targeted by an `Optional` may be missing. Here is the interface of an Optional. 

```scala
trait Optional[From, To] { 
  def getOption(from: From): Option[To]
  def replace(to: To, from: From): From
}
```

Unsurprisingly, we can use an `Optional` to access an optional field in a class.

```scala
case class User(name: String, age: Int, email: Option[String])

val email: Optional[User, String] = ...

val john = User("John Doe", 23, Some("john@foo.com"))

email.getOption(john)
// res0: Option[String] = Some(john@foo.com)
email.replace("john@doe.com", john)
// res1: User = User(John Doe, 23, Some(john@doe.com))
```

We can also build an `Optional` to target any value in a `Map`.

```scala
def index[K, V](key: K): Optional[Map[K, V], V] = ...

val users: Map[String, Int] = Map("john" -> 23, "marie" -> 34)

index("john").getOption(users)
// res2: Option[Int] = Some(23)
index("bob").getOption(users) 
// res3: Option[Int] = None
index("john").replace(20, users)
// res4: Map[String, Int] = Map(john -> 20, marie -> 34)
```

The interfaces follow three rules which ensure that if an `Optional` successfully accesses a value, then it can only 
modify this particular section of the larger object and nothing else. These rules are generally checked using property based testing:
1. if `getOption(from) == Some(x)`, then `replace(x, from) == from` . 
1. if `getOption(from) == Some(x)`, then `getOption(replace(y, from)) == Some(y)` . 
1. if `getOption(from) == None`, then `replace(x, from) == from`.

Perhaps surprisingly, an `Optional` does not let you insert data. You can only change values that already exist, as this example shows.

```scala
index("bob").replace(45, users)
// res5: Map[String, Int] = Map(john -> 23, marie -> 34)
```

`Optional` offers a rich API with more than a dozen useful combinators, but most importantly, `Optional` composes with other 
`Optional` such as you can easily access nested data structure.

```scala
trait Optional[From, To] { self =>
  ...
  def >>>[Next](other: Optional[To, Next]): Optional[From, Next] = ...
}

val users: Map[String, User] = Map(
  "john"  -> User("John Doe"  , 23, Some("john@foo.com")),
  "marie" -> User("Marie Acme", 34, None)
)

(index("john" ) >>> email).getOption(users)
// res10: Option[String] = Some(john@foo.com)
(index("marie") >>> email).getOption(users)
// res11: Option[String] = None
(index("bob"  ) >>> email).getOption(users) 
// res12: Option[String] = None

(index("john" ) >>> email).replace("john@doe.com", users) 
// res13: Map[String, User] = Map(
//   "john"  -> User(John Doe  , 23, Some(john@doe.com)),
//   "marie" -> User(Marie Acme, 34, None)
// )
```

Here is the core of the problem. Both `index("marie") >>> email` and `index("bob") >>> email` fail with `users`. The former 
because Marie doesn't have an email and the latter because Bob is not a valid user. Sadly, we have no way to distinguish 
these two cases.

The issue is that `Optional` returns an `Option` which does not provide any details when it fails. If we want to report 
a precise error message, we need to use something like `Either`. The question is then, what should be the type of the error 
message? Let's start with something simple like `String` and see how far we can go.

## Optional with String error

We only need to change the signature of `getOption` to return an `Either[String, From]`. Let's also use that occasion to rename 
this method `getOrError`. We should probably rename `Optional` too, but I don't have a better idea at the moment.

```scala
trait Optional[From, To] { 
  def getOrError(from: From): Either[String, To]
  def replace(to: To, from: From): From
  
  def >>>[Next](other: Optional[To, Next]): Optional[From, Next] = ...
}

val email = new Optional[User, String] {
  def getOrError(from: User): Either[String, String] =
    from.email.toRight("email is missing")

  def replace(to: String, from: User): User =
    if(from.email.isDefined) from.copy(email = Some(to)) else from
}

(index("john" ) >>> email).getOrError(users)
// res14: Either[String, String] = Right(john@foo.com)
(index("marie") >>> email).getOrError(users)
// res15: Either[String, String] = Left(email is missing)
(index("bob"  ) >>> email).getOrError(users)
// res16: Either[String, String] = Left(Key bob is missing)
```

Yeah! That wasn't too difficult. We could stop here but having the error type hardcoded to String is a bit unsatisfying. 
What if someone wanted to build a DSL to manipulate JSON or YAML ala [JsonPath](https://github.com/circe/circe-optics/blob/956ec1208f45c7e9a7538f56ed99cce97bb5367a/optics/src/test/scala/io/circe/optics/JsonPathSuite.scala#L33) 
from [Circe](https://circe.github.io/circe/). In that case, we may want to return a path from the root element as well as 
an error message.

```scala
(index("users") >>> index("john") >>> index("age")).getOrError(users)
// res17: Either[(Path, String), String] = 
//   Left((users.john, "missing field age"))
```

## Optional with custom error

If we want the error type to be fully customisable by the users, it needs to be a type parameter of `Optional`, e.g. 
`Optional[CustomError, User, Email]`.

```scala
trait Optional[Error, From, To]  { 
  def getOrError(from: From): Either[Error, To]
  def replace(to: To, from: From): From
 
  def >>>[Next](other: Optional[Error, To, Next]): Optional[Error, From, Next] = ...
}
```

Now, let's define a simple configuration language with three types of values: `Int`, `String` and `Object`.

```scala
enum Config {
  case IntConfig(value: Int)
  case StringConfig(value: String)
  case ObjectConfig(value: Map[String, Config])
}

val config: Config = ObjectConfig(Map(
  "http-server" -> ObjectConfig(Map(
    "hostname" -> StringConfig("localhost"),
    "port"     -> IntConfig(8080)
  )),
  "db" -> ObjectConfig(Map(
    "connection" -> IntConfig(4),
    "url"        -> StringConfig("jdbc:postgresql://localhost:5432/db")
  ))
))
```

When we access a `Config`, we can experience two kinds of failure. Either the data is missing, or it is an unexpected 
format, e.g. we want an `Int`, but it is a `String`. Let's also use an enumeration to encode errors.

```scala
enum ConfigFailure {
  case MissingKey(key: String)
  case InvalidFormat(expectedFormat: String, actual: Config)
}
```

Now, we can define a few `Optionals` that parse a generic `Config` into each data type: `Int`, `String`, or `Object`. 
These `Optionals` can only fail because the config type is incorrect, so let's use a specific `InvalidFormat` error.
 
```scala
val int: Optional[InvalidFormat, Config, Int] = ...
val str: Optional[InvalidFormat, Config, String] = ...
val obj: Optional[InvalidFormat, Config, Map[String, Config]] = ...

int.getOrError(IntConfig(12))
// res18: Either[InvalidFormat, Int] = Right(12)

int.getOrError(StringConfig("hello"))
// res19: Either[InvalidFormat, Int] = 
//   Left(InvalidFormat(Int,StringConfig(hello)))
```

If you are familiar with optics hierarchy, you may have noticed that `int`, `str` and `obj` could be a `Prism` (a more 
specific optics). However, `Optional` works fine too, so let's keep things simple. 
Next step, we can adapt `index` to return a `MissingKey` error.

```scala
def index(key: String): Optional[MissingKey, Map[String, Config], Config] = ...

index("db").getOrError(Map.empty)
// res20: Either[MissingKey, Int] = Left(MissingKey(db))
```

Finally, let's define an optics called `property` such as we can have a friendly syntax to access nested `Config` objects.

```scala
property("http-server") >>> property("hostname") >>> str

property("db") >>> property("connection") >>> int
```

`Property` checks if a `Config` is an `Object`, and then it focuses into a key of the `Map`. The error type of `property` 
should be a `ConfigFailure` because it can fail for either reasons.

```scala
def property(key: String): Optional[ConfigFailure, Config, Config] =
  obj >>> index(key)

[ERROR] Type Mismatch Error:
    obj >>> index(key)
            ^^^^^^^^^^^^
Found:    Optional[MissingKey   , Map[String, Nothing], Nothing]
Required: Optional[InvalidFormat, Map[String, Config] , Next]
```

Regrettably, the compiler rejects composing `obj` and `index` together because they have different failure types. `MissingKey` 
and `InvalidFormat` are both `ConfigFailure`, but `>>>` is too strict. It requires both sides of `>>>` to have exactly the same error. 
There are two solutions to this problem:
1. We update the definition of `obj` and `index` to use `ConfigFailure` instead of a more specialised error.
1. We use variance on the error type of `Optional`, and let the compiler automatically adapt the error type when required.


Historically, in the functional programming side of Scala, variance had a lousy reputation. However, libraries like [fs2](https://fs2.io/) 
or [ZIO](https://zio.dev/) recently demonstrated that variance offers a great user experience in terms of [type inference](https://mpilquist.github.io/blog/2018/07/04/fs2/). 
The implementation is slightly more complicated, but it is completely acceptable if end-users enjoy a better experience.

## Optional with covariant error

Variance is quite tricky to grasp. Fortunately, the compiler is here to help us. If we ever use the wrong variance annotation, 
the compiler will let us know and usually give us some suggestions. In our case, we can deduce `Optional` is covariant (`+`) 
in `Error` because the two core methods of `Optional`: `getOrError` and `replace`, only mention `Error` in their output.
 
```scala
trait Optional[+Error, From, To] {
  def getOrError(from: From): Either[Error, To]
  def replace(to: To, from: From): From

  def >>>[NewError >: Error, Next](other: Optional[NewError, To, Next])
    : Optional[NewError, From, Next] = ...
}
```

`>>>` signature is a bit scary, let's go through an example.

```scala
val obj: Optional[InvalidFormat, Config, Map[String, Config]] = ...

def index(key: String): Optional[MissingKey, Map[String, Config], Config] = ...

obj >>> index("foo")
```

`obj` has an error type of `InvalidFormat` and `>>>` has the constraint `NewError >: Error`. It means the 
error type of `index` must be a super type of `InvalidFormat`. We defined `index` with a `MissingKey` error which is not
a super type of `InvalidFormat`. However, since `Optional` is covariant in `Error`, the Scala/Dotty compiler can automatically 
upcast `index` error to satisfy the constraint (see types in green).

![ConfigFailure hierarchy](/images/diagrams/config-failure-hierarchy.svg)

`ConfigFailure`, `AnyRef`, or `Any` are all valid options. The compiler has some heuristics to determine which 
type should be inferred. In this case, it chose the lower bound `ConfigFailure`, see this [presentation](https://www.youtube.com/watch?v=lMvOykNQ4zs) 
from Guillaume Martres for more details about type inference.

Now, let's go back to our main use case.

```scala
def property(key: String): Optional[ConfigFailure, Config, Config] =
  obj >>> index(key)

val config: Config = ObjectConfig(Map(
  "http-server" -> ObjectConfig(Map(
    "hostname" -> StringConfig("localhost"),
    "port"     -> IntConfig(8080)
  )),
  "db" -> ObjectConfig(Map(
    "connection" -> IntConfig(4),
    "url"        -> StringConfig("jdbc:postgresql://localhost:5432/db")
  ))
))

(property("http-server") >>> property("port") >>> int).getOrError(config)
// res21: Either[MissingKey, Int] = Right(8080)
(property("db") >>> property("connection") >>> str).getOrError(config)
// res22: Either[MissingKey, Int] = 
//   Left(InvalidFormat(String,IntConfig(4)))
(property("kafka") >>> property("port") >>> int).getOrError(config)
// res23: Either[MissingKey, Int] = Left(MissingKey(kafka))
```

Great, `>>>` lifted automatically the error of `obj` and `index` to `ConfigFailure` which is precisely what we wanted. 
Can we do better? Are they still some corner cases? 

Imagine we have a third party library like [refined](https://github.com/fthomas/refined/blob/0820276b7cc80390a7cec5ecb353507376167a7f/modules/core/shared/src/main/scala/eu/timepit/refined/types/net.scala#L13), 
offering an `Optional` to check if an `Int` is a `PortNumber`.

```scala
val portNumber: Optional[String, Int, PortNumber] = ...

portNumber.getOrError(8080)
// res24: Either[String, PortNumber] = Right(PortNumber(8080))

portNumber.getOrError(-1)
// res25: Either[String, PortNumber] = Left("-1 is not a port number")
```

We may want to use this validation with our configuration DSL. However, `portNumber` uses a generic `String` error message 
and not our `ConfigFailure` enumeration. So, the type inference algorithm will use the first common parent of 
`ConfigFailure` and `String` which is a rather useless `Anyref`.

```scala
property("http-server") >>> property("port") >>> int >>> portNumber
// res26: Optional[AnyRef, Config, PortNumber]
```

One could argue we should transform the `String` error message from the third-party library error type to our domain model 
using something like `mapError`.

```scala
trait Optional[+Error, From, To] {
  ...
  def mapError[NewError](f: Error => NewError)
   : Optional[NewError, From, Next] = ...
}
```

However, it would be better if by default combining two unrelated errors offered a more precise type than `Any` or `AnyRef`. 
In Scala 2, we are out of luck, but Dotty has some helpful features.

## Composing error with union types

[Union types](https://dotty.epfl.ch/docs/reference/new-types/union-types.html) are a new feature of Dotty. They allow 
defining the most precise upper bound between two or more types. In our previous example, `String | ConfigFailure` would
be the best possible type to return when we compose `int >>> portNumber`.

![Union type](/images/diagrams/config-failure-union-type.svg)

We only need to change the signature of `>>>`; the implementation would stay the same. In my opinion, union types 
simplify the signature of `>>>` since we don't need the constraint `NewError >: Error` anymore.

```scala
trait Optional[+Error, From, To] {
  ...
  def >>>[NewError, Next](other: Optional[NewError, To, Next])
   : Optional[Error | NewError, From, Next] = ...
}

(property("http-server") >>> property("port") >>> int >>> portNumber)
  .getOrError(config)
// res27: Either[String | ConfigFailure, PortNumber] = 
//   Right(PortNumber(8080))
```

Perfect. Type inference works, and we have the most precise error type. Since we are building an `Optional`, we can as quickly
update an arbitrary `Config` (assuming we have some macro to convert a `9000` literal to `PortNumber`).

```scala
(property("http-server") >>> property("port") >>> int >>> portNumber)
  .replace(9000, config)
// res24: Config = ObjectConfig(Map(
//  "http-server" -> ObjectConfig(Map(
//    "hostname" -> StringConfig("localhost"),
//    "port"     -> IntConfig(9000)
//  )),
//  "db" -> ObjectConfig(Map(
//    "connection" -> IntConfig(4),
//    "url"        -> StringConfig("jdbc:postgresql://localhost:5432/db")
//  ))
//))
```

## Conclusion and future work

I am super excited about this new encoding. It is to my knowledge a novel approach leveraging Scala specific features: 
variance and union types. There were several [attempts](https://yairchu.github.io/posts/optics-with-error-reporting.html) 
to add error reporting to Haskell Lens, but the main issue seems to be related to type inference (see discussion on [coindexing](http://oleg.fi/gists/posts/2017-04-26-indexed-poptics.html#coindexed)).

In my next blog post, I will explore the impact of error reporting on the rest of the optics hierarchy, e.g. can we return errors 
with other optics like `Prism` and `Traversal`? How can we add error reporting without breaking existing code? What does 
it mean for `Optional` to have `Nothing` as error type? Surprisingly, we will see that variance and inheritance combine 
exceptionally well and offer a compelling optics encoding.

Stay tuned. In the meantime, you can follow me on [twitter](https://twitter.com/JulienTruffaut) or discuss this article on reddit.