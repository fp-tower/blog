+++
title = "Introducing error reporting in optics"
image = "error-reporting.jpg"
author = "julien truffaut"
tags = ["scala", "monocle"]
date = 2020-01-07T00:00:00+00:00
index = false
course = "Scala Foundation"
+++

A frequently requested feature is the ability to report why an optic failed. It is particularly crucial when you build a sophisticated optic. Say you have a large configuration document, and you want to focus on `kafka.topics.order-events.partitions`. There may not be a `partitions` key, or if it exists, it may have an unexpected format, e.g. it is a String instead of an Int. In Monocle 2.x and other optics libraries, we cannot provide any details about the failure. In this blog post, I would like to discuss my experiments with a new optics encoding that supports detailed error reporting. In particular, I will present a step-by-step refactoring of one specific type of optic such as you can see the failed attempts as well as the final solution.

This article is written using [Dotty](https://dotty.epfl.ch/) `0.21.0-RC1`. All code is available in the following GitHub [repository](https://github.com/julien-truffaut/blog-error-reporting/tree/master/src/main/scala).

## Optional overview

An `Optional` (aka Affine Traversal) is an optics used to access a section (`To`) of a larger object (`From`). 
As the name implies, the area targeted by an `Optional` may be missing, which makes it a good use case to discuss error 
reporting. Here is the interface of an Optional. 

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

The interface follow three rules which ensure that if an `Optional` gives access to some value, then you can only modify this particular 
section and nothing else. These following rules are generally checked using property based testing:
1. if `getOption(from) == None`, then `replace(x, from) == from`.
1. if `getOption(from) == Some(x)`, then `replace(x, from) == from` . 
1. if `getOption(from) == Some(x)`, then `getOption(replace(y, from)) == Some(y)` . 

Perhaps surprisingly, an `Optional` does not let you insert data. You can only change values that already exist, as this example shows.

```scala
index("bob").replace(45, users)
// res5: Map[String, Int] = Map(john -> 23, marie -> 34)
```

`Optional` offers a rich API with more than a dozen useful combinators. For example, `modify` and `modifyOption` allow you to apply a function on the target.

```scala
index("john").modify(_ * 2, users)
// res6: Map[String, Int] = Map(john -> 46, marie -> 34) 
index("bob").modify(_ * 2, users)
// res7: Map[String, Int] = Map(john -> 23, marie -> 34) 

index("john").modifyOption(_ * 2, users)
// res8: Option[Map[String, Int]] = Some(Map(john -> 46, marie -> 34)) 
index("bob").modifyOption(_ * 2, users)
// res9: Option[Map[String, Int]] = None
```

Most importantly, `Optional` composes such as you can easily access nested data structure.

```scala
trait Optional[From, To] { self =>
  def getOption(from: From): Option[To]
  def replace(to: To, from: From): From
  
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

Both `index("marie") >>> email` and `index("bob") >>> email` fail with `users` as input. The former because 
`marie` doesn't have an email and the latter because `bob` is not a valid user. However, we have no way to distinguish 
these two cases.

The issue is that `Optional` returns an `Option` which doesn't provide any details when it fails. If we want to report 
a precise error message, we need to use something like `Either`. The question is then, what should be the type of the error 
message? Let's start with something simple like `String` and see how far we can go.

## Optional with String error

We only need to change the signature of `getOption` to return an `Either[String, From]`. Let's also use that occasion to rename 
this method to `getOrError`. 

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

Yeah! That wasn't so difficult. We can even define `getOption` in terms of `getOrError` for backward compatibility.

```scala
trait Optional[From, To] { 
  ...
  def getOption(from: From): Option[To] =
    getOrError(from).toOption
}
```

We could stop here but having the error type hardcoded to String is a little bit unsatisfying. What if someone wanted to build 
a DSL to manipulate JSON or YAML ala [JsonPath](https://github.com/circe/circe-optics/blob/956ec1208f45c7e9a7538f56ed99cce97bb5367a/optics/src/test/scala/io/circe/optics/JsonPathSuite.scala#L33) 
from [Circe](https://circe.github.io/circe/). In that case, we may want to return a path from the root element as well as 
an error message.

```scala
(index("users") >>> index("john") >>> index("age")).getOrError(users)
// res17: Either[(Path, String), String] = 
//   Left((users.john, "missing field age"))
```

## Optional with custom error

If we want the error type to be fully customisable by users, it needs to be a type parameter of `Optional`, e.g. 
`Optional[String, User, Email]` or `Optional[CustomError, User, Email]`.

```scala
trait Optional[Error, From, To]  { 
  def getOrError(from: From): Either[Error, To]
  def replace(to: To, from: From): From
 
  def >>>[Next](other: Optional[Error, To, Next]): Optional[Error, From, Next] = ...
}
```

Now, let's define a simple configuration language with three types of values: `Int`, `String` or `Object`.

```scala
enum Config {
  case IntConfig(value: Int)
  case StringConfig(value: String)
  case ObjectConfig(value: Map[String, Config])
}

val config: Config = ObjectConfig(Map(
  "john"  -> ObjectConfig(Map(
    "name"  -> StringConfig("John Doe"),
    "age"   -> IntConfig(23)
  )),
  "marie" -> ObjectConfig(Map(
    "name"  -> StringConfig("Marie Acme"),
    "age"   -> StringConfig("forty-three")
  ))
))
```


When we access a `Config`, we can experience two types of failure. Either the data is missing, or it is an unexpected 
format, e.g. we want an `Int`, but it is a `String`. Let's also use an enum to encode that.

```scala
enum ConfigFailure {
  case MissingKey(key: String)
  case InvalidFormat(expectedFormat: String, actual: Config)
}
```

Now, we can define `Optionals` that parse a generic `Config` into each data type: `Int`, `String`, or `Object` (these 
could be `Prism`, a more precise optic). We can also adapt `index` to fail with a `MissingKey` error.

```scala
val int: Optional[InvalidFormat, Config, Int] = ???
val str: Optional[InvalidFormat, Config, String] = ???
val obj: Optional[InvalidFormat, Config, Map[String, Config]] = ???

def index[A](key: String): Optional[MissingKey, Map[String, A], A] = ???

int.getOrError(IntConfig(12))
// res18: Either[InvalidFormat, Int] = Right(12)

int.getOrError(StringConfig("hello"))
// res19: Either[InvalidFormat, Int] = 
//   Left(InvalidFormat(Int,StringConfig(hello)))

index("users").getOrError(Map.empty)
// res20: Either[MissingKey, Int] = 
//   Left(MissingKey(users))
```

However, if we try to combine these optics we get the following failure.

```scala
obj >>> index("users") >>> obj >>> index("john") >>> obj >>> index("age") >>> int
                                   ^^^^^^^^^^^^         
Type Mismatch Error:
Found:    Optional[MissingKey   , Map[String, Nothing], Nothing]
Required: Optional[InvalidFormat, Map[String, Config ], Next]
```
