+++
title = "Monocle 3 Roadmap"
image = "monocle3-banner-102-high-res-01.png"
author = "julien truffaut"
tags = ["monocle"]
date = 2021-01-21T00:00:00+00:00
course = "Scala Foundation"
index = false
+++

Monocle is quite an old Scala library. It was initially conceived in 2014 as a port of the [Haskell Lens](https://hackage.haskell.org/package/lens) library. 
Over the years, we've adapted the optics encoding to better accommodate the JVM runtime and the unique blend of OOP and FP present in Scala. 
In turn, key aspects of Monocle’s design have been adapted for other programming languages such as [Kotlin](https://arrow-kt.io/docs/optics/lens/) and [Java](https://github.com/functionaljava/functionaljava).

Although Monocle is widely used in the Scala ecosystem, its API is complicated and quite verbose. In our next major version, Monocle 3, we intend to focus on user experience, especially for beginners. For this version, we have set four primary objectives, each of which will be expanded on below:
1. Simpler API
1. More pragmatic
1. Smaller footprint
1. Clearer documentation

## Timeline

We plan to release the first milestone for Monocle 3 as soon as possible to gather feedback from existing users. 
Then, we'll set a few more milestones to incorporate feedback and include more complicated features such as macros. 

Our tentative timeline for Monocle 3:
* M1 (January 2021): early preview
* (March 2021): add macros and incorporate feedback from M1
* M3/RC1 (June 2021): Documentation and migration guide (preferably with scalafix)

## How can I help?

You don't need to be an expert in optics to help us. You can contribute by doing any of the following:
1. Try the new version and give us feedback on [Gitter](https://gitter.im/optics-dev/Monocle) or [GitHub](https://github.com/optics-dev/Monocle/discussions).
1. Share this article on social media or at your place of work.
1. Report bugs or pain points with the API.
1. Comment on the proposals in the issue tracker.
1. Send us pull requests (let us know beforehand what you are working on).

<br>

# Objectives for Monocle 3 

## 1. Simpler API

The Monocle 2 API is complex and often requires in-depth knowledge of optics’ internals. In Monocle 3, we want to remove as much complexity as possible to improve user experience, particularly for new users. 

### 1.1 Optics composition (Issue [#964](https://github.com/optics-dev/Monocle/issues/964))
*Planned for M1*

In Monocle 2, each optics have several compose functions such as `composeLens`, `composePrism`, `composeOptional` (see full table). This causes two problems:
1. Verbose optics composition, `address composeOptional index("home") composeLens postcode`. Here, more than half of the code consists of composeX methods.
1. Users need to know that `index` is an `Optional` while `postcode` is a `Lens`.

Additionally, optics composition works very much like function composition; if you have an `Optic[A, B]` and `Optic[B, C]`, you can compose them to get an `Optic[A, C]`. However, in the example below, you will notice that the order of type parameters in `Optic#compose` is more similar to the `andThen` method of `Function1` than to `compose`.

```scala
trait Optic[A, B] {
  def compose[C](other: Optic[B, C]): Function[A, C]
}

trait Function1[A, B] {
  def compose[C](other: Function1[C, A]): Function[C, B]
  def andThen[C](other: Function1[B, C]): Function[A, C]
}
```

Therefore, in Monocle 3, we will deprecate all `composeX` methods in favor of a new overloaded `andThen` method. This change may cause regression in the type inference when composing:
1. Optics with type parameters, e.g. `some[A]`.
1. Optics coming from typeclasses such as `index` or `each`.
However, most of these issues should be fixed by "shortcuts for popular optics" (see below) and Scala 3 which has a much better type inference algorithm. 

### 1.2 Shortcuts for popular optics [#978](https://github.com/optics-dev/Monocle/pull/978),
*Planned for M1*

Some optics are extremely common, yet it can be challenging to find and figure out which is suitable. For example, common questions from users are:

"How can I zoom into an Option?" or 
"How can I access an element at a particular key within a Map? What if the key doesn't exist?"

This is partly a documentation problem, but it is also due to the nature of optics composition. You can compose almost any pair of optics together as long as the output type of the first matches the input type of the second. This freedom makes it difficult to decide which to use. At least, this was the case in Monocle 2. In Monocle 3, we will add methods on all optics for all common cases of optics compositions. For example,

```scala
case class User(name: String, addresses: List[Address])

case class Address(
  streetNumber: Int, 
  postCode: String, 
  county: Option[String]
)

val addresses = GenLens[User](_.addresses)
val county    = GenLens[Address](_.county)

// Monocle 3
addresses.index(1).andThen(county).some

// Monocle 2
import monocle.function.Index.index
import monocle.std.option.some

addresses
  .composeOptional(index(1))
  .composeLens(county)
  .composePrism(some)
```

This change has multiple consequences:
1. Users don’t need to add or learn about special imports.
1. Users can use IDE completion to find out which optics are available.
1. Side step type inference issue with overloaded `andThen` (see [example](https://github.com/lampepfl/dotty/issues/8418) in Scala 3)

### 1.3 Use replace instead of set (issue [#961](https://github.com/optics-dev/Monocle/issues/961))
*Planned for M1*

One of the most frequent questions in the Monocle Gitter is:
"Why doesn't `set` insert a value when the input is None? "

In the example below, many users expect the result to be `User("John", Some("j@foo.com"))`.
```scala
case class User(name: String, email: Option[String])

GenLens[User](_.email).some.set("j@foo.com")(User("John", None))
// res: User = User("John", None)
```

While this is a linguistic issue, not a bug: `set` implies it can insert a value when there is none, which is not possible. Therefore, we have decided to deprecate `set` in favor of `replace`. Hopefully, the latter indicates we are updating an existing value rather than inserting one.

### 1.4 Focus macro
*Planned for M2*

Monocle offers several macros to automate optics creation:
* `GenLens` to focus into a field of a case class.
* `GenPrism` to focus into a branch of an enumeration (`sealed trait`).
* `GenIso` for new types (e.g. `case class Id(value: Long)`) or to see a case class as a tuple of fields.

This approach presents a few issues:
1. Users need to know which macro to use for their use case (barrier to entry)
1. The code is still verbose when you need to mix different types of optics, e.g. 
```scala
GenLens[User](_.paymentMethod)                 // focus into field
  .andThen(GenPrism[PaymentMethod, DebitCard]) // focus into a branch
  .andThen(GenLens[DebitCard](_.cardNumber))   // focus into a field
```

Instead, Monocle 3 will propose a single macro (to rule them all) and offer an API similar to XPath/JsonPath.

```scala
Focus[User](_.paymentMethod.as[DebitCard].cardNumber)
// or with a simpler example
Focus[User](_.address.streetNumber)
```

No need to learn about and differentiate `Lens`, `Prism` or `Iso` anymore. The macro will generate the right type for the path.

We are considering symbolic operators such as `?` to zoom into an `Option` or `*` to access all elements in a collection. This would provide a similar API to JsonPath, which users may be familiar with. Though we are also wary of using symbols as they cause difficulties while searching for them.

We also plan to integrate `Focus` into `ApplyOptics` to facilitate a more object-oriented syntax: 
```scala
user.focus(_.paymentMethod.as[DebitCard].cardNumber).getOption
user.focus(_.address.streetNumber).replace(15)
```
This syntax is particularly convenient for single-use optics as you don't need to give the optic name.

Special thanks to [Yilin Wei](https://twitter.com/_YilinWei_) for the original idea and [Ken Scambler](https://twitter.com/KenScambler) and [Asjad Baig](https://twitter.com/AsjadSB) for their contribution to this feature.

`Focus` macro will only be available in Monocle 3 for Scala 3. If you are using Scala 2, we will maintain the old macros for a few release cycles. It might be possible to port `Focus` to Scala 2, but it requires too much effort. This is also some good motivation to migrate to Scala 3 ;)

## 2. More pragmatic
*Planned for M1*

Monocle defines properties (aka laws) for each optics. These properties are essentially a test suite that verifies optics behave as expected. For example, a `Lens` focuses on a **single** piece of data inside a case class; hence, the test suite verifies that the optic doesn't modify other parts of the object. 

Until now, we have refused to include any methods in the `core` module that could break those properties, even if the chances were slim and the use case extremely convenient. In Monocle 3, we plan to take a more pragmatic approach and allow those combinators if we judge they are useful enough. We will also document if and when they might cause surprising behaviors.

You can find below a few examples of the new combinators.

### 2.1 withDefault
To provide a default value in case an `Option` is empty.

```scala
case class User(name: String, email: Option[String])
val email = Focus[User](_.email).withDefault("no-reply@foo.com")
val bob = User("bob", None)

email.get(bob)
// res: String = "no-reply@foo.com"

email.modify(_.toUpperCase)(bob)
// User("bob",Some("NO-REPLY@FOO.COM"))
```

### 2.2 filter
To select a target based on its value.

```scala
case class Order(id: String, items: List[String])
case class Item(name: String, quantity: Int, unitPrice: Double)

val order = Order(123, List(
  Item("Lego set", 2, 13.99),
  Item("Puzzle"  , 3,  8.99),
  Item("Book"    , 4, 11.49)
))

val expensiveItems = Focus[Order](_.items).filter(_.unitPrice > 10)

expensiveItems.andThen(Focus[Item](_.quantity)).replace(1)(orders)
// res: Order = Order(123, List(
//    Item("Lego set", 1, 13.99), // UPDATED
//    Item("Puzzle"  , 3,  8.99), 
//    Item("Book"    , 1, 11.49)  // UPDATED
//  ))
```

## 3. Smaller footprint
*Planned for M1*

Remove rarely-used features and simplify the build to reduce maintainer workload.

1. Drop Scala 2.12.
1. Use `at` with a singleton instead of dedicated methods, e.g., `first` becomes `at(1)`, `second` becomes `at(2)`, and so on.
1. Deprecate symbolic operators `^|-?`, `|->`, `&|->`, `_1`, `_2`, and so on.
1. Deprecate `head`, `headOption`, `tail`, `tailOption`, `empty`, `possible`, `reverse`, `last`, `lastOption`, `init`, `initOption`, `curry`, `uncurry`.
1. Deprecate the generic module (shapeless dependency).
1. Deprecate the state module. If you are a heavy user of the state module, we encourage you to create a separate library.

## 4. Clearer documentation

### 4.1 Scalafix migration
*Planned for M3*

Automate the migration from Monocle 2 to 3 using Scalafix. See this list of API changes [#1001](https://github.com/optics-dev/Monocle/issues/1001).

### 4.2 New website
*Planned for M3*

The current microsite is too focused on optics internals. We need to rewrite the documentation from scratch with a particular focus on the "Getting Started" section to better onboard new users.

### 4.3 Online course 
*Late 2021*

FP-Tower is considering a short (3-5 hours) online course around Monocle API and optics fundamentals. If you would be interested in this type of resource, please [let us know](/contact-us/). 

## Conclusion
We hope that the Monocle 3 API will be simple enough for Scala developers to reach for whenever they need to access or transform immutable data. We believe that the `Focus` macro and other API simplifications will help us achieve that goal. 
```scala
user.focus(_.address.streetNumber).replace(15)
```
However, we need your help in testing both the documentation and each Monocle 3 milestone to ensure we don’t miss our targets. 

Have a great day everyone, happy coding.
 
You can discuss this article on reddit.