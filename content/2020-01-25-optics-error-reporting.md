+++
title = "Error reporting with optics"
image = "error-reporting.jpg"
author = "julien truffaut"
tags = ["scala", "monocle"]
date = 2020-01-07T00:00:00+00:00
+++

A frequently requested feature is the ability to report why an optic failed. It is particularly crucial when you build a sophisticated optic. Say you have a large configuration document, and you want to focus on `kafka.topics.order-events.partitions`. There may not be a `partitions` key, or if it exists, it may have an unexpected format, e.g. it is a String instead of an Int. In Monocle 2.x and other optics libraries, we cannot provide any details about the failure. In this blog post, I would like to present my experiments with a new optics encoding that supports detailed error reporting and almost reduce by half the optics hierarchy!

This article is written using [Dotty](https://dotty.epfl.ch/) `0.21.0-RC1`. Dotty will soon become [Scala 3](https://www.scala-lang.org/blog/2018/04/19/scala-3.html).

## Optional

An `Optional` (aka Affined Traversal) is an optics used to access a section (`To`) of a larger object (`From`). 
As the name implies, the area targeted by an `Optional` may be missing, which makes it a good use case to discuss error 
reporting. Here is the interface of an Optional. 

```scala
trait Optional[From, To] { 
  def getOption(from: From): Option[To]
  def replace(to: To, from: From): From
}
```

The interface follows three main rules:
1. if `getOption(from) == None`, then `replace(x, from) == from`.
1. if `getOption(from) == Some(x)`, then `replace(x, from) == from` . 
1. if `getOption(from) == Some(x)`, then `getOption(replace(y, from)) == Some(y)` . 

These three rules ensure that if an `Optional` gives you access to some value, then you can only modify this particular 
section and nothing else. Perhaps surprisingly, an `Optional` doesn't let you insert data; you can only change some values 
that already exist.

Now, let's have a look at some `Optional` use cases.

```scala
def index[K, V](key: K): Optional[Map[K, V], V] =
  new Optional[Map[K, V], V] {
    def getOption(from: Map[K, V]): Option[V] =
      from.get(key)

    def replace(to: V)(from: Map[K, V]): Map[K, V] =
      if(from.contains(key)) from + (key -> to) 
      else from
  }

val users: Map[String, Int] = Map("john" -> 23, "marie" -> 34)

index("john").getOption(users)
// res0: Option[Int] = Some(23)
index("bob").getOption(users) 
// res1: Option[Int] = None

index("john").replace(20, users)
// res2: Map[String, Int] = Map("john" -> 20, "marie" -> 34)
index("bob").replace(20, users) // no-op 
// res3: Map[String, Int] = Map("john" -> 23, "marie" -> 34) 
```

`Optional` offers a rich API with more than a dozen useful combinators. For example, `modify` and `modifyOption` allow you to apply a function on the target.

```scala
index("john").modify(_ + 1, users)
// res4: Map[String, Int] = Map("john" -> 24, "marie" -> 34) 
index("bob").modify(_ + 1, users)
// res5: Map[String, Int] = Map("john" -> 23, "marie" -> 34) 

index("john").modifyOption(_ + 1, users)
// res6: Option[Map[String, Int]] = Some(Map("john" -> 24, "marie" -> 34)) 
index("bob").modifyOption(_ + 1, users)
// res7: Option[Map[String, Int]] = None
```

Most importantly, `Optional` composes such as you can easily access nested data structure.

```scala
trait Optional[From, To]  { 
  def getOption(from: From): Option[To]
  def replace(to: To, from: From): From
  
  @alpha("andThen") 
  def >>>[Next](other: Optional[To, Next]): Optional[From, Next]
}

val users: Map[String, Map[String, String]] = 
  Map(
    Map("john"  -> Map("name" -> "John Doe"  , "email" -> "john@foo.com"), 
    Map("marie" -> Map("name" -> "Marie Acme")
  )

(index("john" ) >>> index("email")).getOption(users)
// res8: Option[String] = Some("john@foo.com")
(index("marie") >>> index("email")).getOption(users)
// res9: Option[String] = None
(index("bob") >>> index("name")).getOption(users) 
// res10: Option[String] = None

(index("john") >>> index("email")).replace("john@gmail.com", users) 
// res11: Map[String, Map[String, String]] = Map(
//   Map("john"  -> Map("name" -> "John Doe", "email" -> "john@gmail.com"), 
//   Map("marie" -> Map("name" -> "Marie Acme")
// )
```

Both `index("marie") >>> index("email")` and `index("bob") >>> index("name")` fail with `users` as input. The former because 
`marie` doesn't have an `email` and the latter because `bob` is not a valid user. However, we have no way to distinguish 
these two cases.

The issue is that `Optional` returns an `Option` which doesn't provide any details when it fails. If we want to report 
a precise error message, we need to use something like `Either`, but the question is, what should be the type of the error 
message? Let's start with something simple like `String` and see how far can we go.

## Optional with String error

We only need to change the signature of `getOption` to return an `Either[String, From]`. Let's also use that occasion to rename 
the method to `getOrError`.

```scala
trait Optional[From, To] { 
  def getOrError(from: From): Either[String, To]
  def replace(to: To, from: From): From
  
  @alpha("andThen") 
  def >>>[Next](other: Optional[To, Next]): Optional[From, Next]
}

def index[K, V](key: K): Optional[Map[K, V], V] =
  new Optional[Map[K, V], V] {
    def getOrError(from: Map[K, V]): Either[String, To] =
      from.get(key).toRight(s"Key $key is missing")

    def replace(to: V)(from: Map[K, V]): Map[K, V] =
      if(from.contains(key)) from + (key -> to) 
      else from
  }

(index("john" ) >>> index("email")).getOrError(users)
// res12: Either[String, String] = Right("john@foo.com")
(index("marie") >>> index("email")).getOrError(users)
// res13: Either[String, String] = Left("Key email is missing")
(index("bob")   >>> index("name") ).getOrError(users)
// res14: Either[String, String] = Left("Key bob is missing")
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
// res15: Either[(Path, String), String] = Left((users.john, "missing field age"))
```

Someone else may want to define a custom enumeration to describe the failure such as it is easier to test.
                                                            
```scala
enum CustomFailure {
  case MissingKey(key: String)
  case InvalidFormat(key: String, expected: Format, actual: Format)
}

(index("users") >>> index("john") >>> index("age")).getOrError(users)
// res16: Either[CustomFailure, String] = Left(InvalidFormat("age", Number, String))
```

## Optional with custom error

If we want the error type to be fully customisable by users, it needs to be a type parameter of `Optional`.

```scala
trait Optional[Error, From, To]  { 
  def getOrError(from: From): Either[Error, To]
  def replace(to: To, from: From): From
 
  @alpha("andThen") 
  def >>>[Next](other: Optional[Error, To, Next]): Optional[Error, From, Next]
}
```

Now, let's define a simple configuration language with three types of values: `Int`, `String` or `Object`.

```scala
enum Config {
  case IntConfig(value: Int)
  case StringConfig(value: String)
  case ObjectConfig(value: Map[String, Config])
}
```

And corresponding `Optional` with custom failure type.

```scala
enum ConfigFailure {
  case MissingKey(key: String)
  case InvalidFormat(expectedFormat: String, actual: Config)
}

val int: Optional[InvalidFormat, Config, Int] = ???
val str: Optional[InvalidFormat, Config, String] = ???
val obj: Optional[InvalidFormat, Config, Map[String, Config]] = ???

def index[A](key: String): Optional[MissingKey, Map[String, A], A] = ???

int.getOrError(IntConfig(12))
// res17: Either[InvalidFormat, Int] = Right(12)

int.getOrError(StringConfig("hello"))
// res18: Either[InvalidFormat, Int] = Left(InvalidFormat("Int", StringConfig("hello")))

index("users").getOrError(Map.empty)
// res18: Either[MissingKey, Int] = Left(MissingKey("users")))
```

We are able to define precise error type for all our `Optional`. In theory, we should be able to define 

```scala
obj >>> index("users") >>> obj >>> index("john") >>> obj >>> index("age") >>> int
```

`Optional` is covariant in `Error` because `Error` only appear in return type of 

```scala
trait Optional[+Error, From, To]  { 
  def getOrError(from: From): Either[Error, To]
  def replace(to: To, from: From): From

  @alpha("andThen") 
  def >>>[NewError >: Error, Next](other: Optional[NewError, To, Next]): Optional[NewError, From, Next]
}
```