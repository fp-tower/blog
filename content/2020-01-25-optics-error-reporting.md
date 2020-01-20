+++
title = "Error reporting with optics"
image = "cropped-round-mirror-2853432.jpg"
author = "julien truffaut"
tags = ["scala", "monocle"]
date = 2020-01-07T00:00:00+00:00
+++

A frequently requested feature is the ability to report why an optic failed. It is particularly crucial when you build a sophisticated optic. Say you have a large configuration document, and you want to focus on `kafka.topics.order-events.partitions`. There may not be a `partitions` key, or if it exists, it may have an unexpected format, e.g. it is an array instead of an Int. In Monocle 2.x and other optics libraries, we cannot provide any details about the failure; we return an `Option` instead of an `Either[Failure, *]`. In this blog post, I would like to present my experiments with a new optics encoding that supports error reporting and almost reduce by half the optics hierarchy!

This article is written using [Dotty](https://dotty.epfl.ch/) `0.21.0-RC1`.

## Optional

First, let's start by defining an Optional (aka Affined Traversal). An `Optional` is an optics used to access a section of a larger object. Here is the interface of an `Optional`. 

```scala
trait Optional[From, To]  { 
  def getOption(from: From): Option[To]
  def replace(to: To, from: From): From
}
```

`From` is typically a large object and `To` is a section of `From`. 

The `Optional` interface follows three main rules:
1. if `getOption(from) == None`, then `replace(x, from) == from`.
1. if `getOption(from) == Some(x)`, then `replace(x, from) == from` . 
1. if `getOption(from) == Some(x)`, then `getOption(replace(y, from)) == Some(y)` . 

These three rules ensure that if an Optional gives you access to some value, then you can only modify this particular section and nothing else.

Let's have a look at a couple of use cases for Optional.

```scala
def index[K, V](key: K): Optional[Map[K, V], V] =
  new Optional[Map[K, V], V] {
    def getOrError(from: Map[K, V]): Option[V] =
      from.get(key)
    def replace(to: V)(from: Map[K, V]): Map[K, V] =
      if(from.contains(key)) from + (key -> to) 
      else from
  }

val users: Map[String, Int] = Map( "John" -> 23, "Marie" -> 34)

index("John").getOption(users) // Some(23)
index("Elsa").getOption(users) // None

index("John").replace(20, users) //  Map("John" -> 20, "Marie" -> 34)
index("Elsa").replace(20, users) //  no-op returns 
```

`Optional` offers a much richer API with more than a dozen useful combinators. For example, `modify` allow you to apply a function on the target.

```scala
index("John").modify(_ + 1, users) // Map( "John" -> 24, "Marie" -> 34)
```

Most importantly, `Optional` composes such as you can easily access nexted data structure.

```scala
trait Optional[From, To]  { 
  def getOption(from: From): Option[To]
  def replace(to: To, from: From): From
  
  @alpha("andThen") 
  def >>>[Next](other: Optional[To, Next]): Optional[From, Next]
}

val users: Map[String, Map[String, String]] = 
  Map(
    Map( "John"  -> Map("name" -> "John Doe", "email" -> "john@foo.com"), 
    Map( "Marie" -> Map("name" -> "Marie Acme")
  )

(index("John" ) >>> index("email")).getOption(users) // Some("john@foo.com")
(index("Marie") >>> index("email")).getOption(users) // None

(index("John") >>> index("email")).replace("john@gmail.com", users) 
// Map(
//   Map( "John"  -> Map("name" -> "John Doe", "email" -> "john@gmail.com"), 
//   Map( "Marie" -> Map("name" -> "Marie Acme")
// )
```