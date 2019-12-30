+++
title = "State of Monocle"
image = "monocle-logo.png"
author = "julien truffaut"
tags = ["scala", "monocle"]
date = 2019-12-30T00:00:00+00:00
+++

[Monocle](https://github.com/julien-truffaut/Monocle), like many other Scala functional libraries, was inspired by Haskell.
In our case, it is the [Lens](https://hackage.haskell.org/package/lens) library by Edward Kmett and al.

In Monocle, we experimented with various optics encoding: pair of functions, Van Laarhoven, and profunctor
(see [LensImpl](https://github.com/julien-truffaut/LensImpl)). The JVM and Haskell runtime are hugely different, and an 
encoding that works well in Haskell can be inefficient in Scala. For example, Haskell relies on zero cost wrapper (newtype)
to effectively select typeclass instances, but we don't have an equivalent in Scala/JVM yet ([opaque types](https://dotty.epfl.ch/docs/reference/other-new-features/opaques.html)
may help). You can find some of the benchmarks we made for Lenses in 2015 [here](https://github.com/julien-truffaut/Monocle/wiki/Lens-Benchmark).

However, something we didn't do very well was to adapt the API to the specificity of Scala. If you look at Monocle
1.x or 2.x, it has the same interface as Haskell Lens but expressed in a much more clunky way. The example of this can
be seen in optics composition, i.e. how we build complex optics out of simpler ones.


``` scala
case class Person(name: String, address: Address)

case class Address(
  streetNumber: Int, 
  postCode: String, 
  county: Option[String]
)

// Assume we have:
// address a Lens[Person, Address] and 
// county a Lens[Address, Option[String]]

address . county . _Some // Haskell Lens
address.composeLens(county).composePrism(some) // Scala Monocle
```


They are two main reasons why Monocle has a worse interface than Haskell Lens.

### 1. Optics in Lens are type aliases

All optics in Haskell Lens are type aliases for fancy functions, e.g.

 ```haskell
 type      Lens a b =     Functor f => (b -> f b) -> a -> f a
 type Traversal a b = Applicative f => (b -> f b) -> a -> f a
``` 

The entire Haskell library is designed for optics composition to be "just" function composition (`.` in Haskell).
It also means one can define an optic without depending on thes Lens library. Unfortunately, we cannot use this
encoding in Scala 2; we would need polymorphic functions which 
we may have in [Scala 3](   (https://github.com/lampepfl/dotty/pull/4672)).

### 2. Overloaded methods have type inference issues 

Almost all optics compose together, see table:


|               | Fold       | Getter     | Setter     | Traversal    | Optional   | Prism      | Lens       | Iso        |
| ------------- |:----------:|:----------:|:----------:|:------------:|:----------:|:----------:|:----------:|:----------:|
| **Fold**      | **Fold**   | Fold       | Fold       | Fold         | Fold       | Fold       | Fold       | Fold       |
| **Getter**    | Fold       | **Getter** | -          | Fold         | Fold       | Fold       | Getter     | Getter     |
| **Setter**    | -          | -          | **Setter** | Setter       | Setter     | Setter     | Setter     | Setter     |
| **Traversal** | Fold       | Fold       | Setter     |**Traversal** | Traversal  | Traversal  | Traversal  | Traversal  |
| **Optional**  | Fold       | Fold       | Setter     | Traversal    |**Optional**| Optional   | Optional   | Optional   |
| **Prism**     | Fold       | Fold       | Setter     | Traversal    | Optional   | **Prism**  | Optional   | Prism      |
| **Lens**      | Fold       | Getter     | Setter     | Traversal    | Optional   | Optional   |**Lens**    | Lens       |
| **Iso**       | Fold       | Getter     | Setter     | Traversal    | Optional   | Prism      | Lens       |**Iso**     |

We could define overloaded compose methods, one for each valid combination of optics. 

```scala
trait Lens[A, B] {
  def compose[C](other:      Iso[B, C]):     Lens[A, C] = ???
  def compose[C](other:     Lens[B, C]):     Lens[A, C] = ???
  def compose[C](other:    Prism[B, C]): Optional[A, C] = ???
  def compose[C](other: Optional[B, C]): Optional[A, C] = ???
  // ...
}
```

Sadly, there is a bug in Scala 2 that makes the type inference weaker with overloaded methods (see [issue](https://github.com/julien-truffaut/Monocle/issues/417)).
There is an easy workaround; we can use non-overloaded compose methods, e.g.

```scala
trait Lens[A, B] {
  def composeIso[C]     (other:      Iso[B, C]):     Lens[A, C] = ???
  def composeLens[C]    (other:     Lens[B, C]):     Lens[A, C] = ???
  def composePrism[C]   (other:    Prism[B, C]): Optional[A, C] = ???
  def composeOptional[C](other: Optional[B, C]): Optional[A, C] = ???
  // ...
}
```

The type inference now works, but the API is much more verbose. Fortunately, Dotty fixed this issue so we can expect a
single overloaded compose method in Monocle for Scala 3.

## What's next?

In September, we kicked out the development of a new major version for [Monocle](https://github.com/julien-truffaut/Monocle/issues/714). 
The main goal of Monocle [3.x](https://github.com/julien-truffaut/Monocle/tree/3.x) is to make the API user-friendly. To do this, we will rewrite the library from scratch and try
to leverage Scala features such as inheritance, class methods, and variance. More in my next post, stay tuned.

If you would like to participate in the development of Monocle, we are always looking for new contributors and active
maintainers. You don't necessarily need to be an expert in optics. We also need help to create benchmarks, documentation,
tutorials, and general API feedback.
