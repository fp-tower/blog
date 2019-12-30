+++
title = "State of Monocle"
image = "monocle-logo.png"
author = "julien truffaut"
tags = ["scala", "monocle"]
date = 2019-12-30T00:00:00+00:00
+++

Monocle, like many other Scala FP libraries, was inspired by Haskell. In our case, it is the Lens library by 
Edward Kmett and al.

In Monocle, we experimented with various optics encoding: pair of functions, Van Laarhoven, and profunctor
(see [LensImpl](https://github.com/julien-truffaut/LensImpl)). The JVM and Haskell runtime are hugely different, and an 
encoding that works well in Haskell can be inefficient in Scala. For example, Haskell relies on zero cost wrapper (newtype)
to effectively select typeclass instances, but we don't have an equivalent in Scala/JVM yet (opaque types may help). 
You can find some of the benchmarks we made for Lenses in 2015 here.

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


They are two main reasons why Monocle doesn't have such a nice interface as Haskell Lens:

* Optics in Lens are aliases for fancy functions, e.g. `type Lens a b = functor f => (b -> f b) -> a -> f a`. So optics
composition is "just" function composition (`.` in Haskell). We cannot use this encoding in Scala 2; we would
 need [polymorphic functions](https://github.com/lampepfl/dotty/pull/4672) which we may have in Scala 3.

* Almost all optics compose together (see [table](http://julien-truffaut.github.io/Monocle/optics.html#optic-composition-table)).
We could define overloaded compose methods, one for each valid combination of optics. Unfortunately, there is a bug in
Scala 2 that makes the type inference weaker with overloaded methods (see [issue](https://github.com/julien-truffaut/Monocle/issues/417)).
There is an easy workaround; we can use non-overloaded compose methods, e.g. composeLens, composePrism, composeIso, etc.
The type inference now works, but the API is much more verbose. Fortunately, Dotty fixed this issue so we can expect a
single overloaded compose method in Monocle for Scala 3.

In September, we quicked out the development of a new major version for [Monocle](https://github.com/julien-truffaut/Monocle/issues/714). 
The main goal of Monocle v3 is to make the API user-friendly. To do this, we will rewrite the library from scratch and try
to leverage Scala features such as inheritance, class methods, and variance. More in my next post, stay tuned.

If you would like to participate in the development of Monocle, we are always looking for new contributors and active
maintainers. You don't necessarily need to be an expert in optics. We also need help to create benchmarks, documentation,
tutorials, and general API feedback.
