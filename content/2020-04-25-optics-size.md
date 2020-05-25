+++
title = "Optics size"
image = "wood-creative-camera-photography.jpg"
author = "julien truffaut"
tags = ["scala", "monocle"]
date = 2020-04-07T00:00:00+00:00
course = "Scala Foundation"
index = false
+++

In my previous [post](../2020-01-27-introducing-error-reporting-in-optics), I discussed how to change 
Optional such as we can get useful error messages. The best solution encoded the error type in 
an extra covariant type parameter, similar to how [ZIO](https://zio.dev/docs/overview/overview_index) error 
works. Today, I would like to present how this simple change will have a profound impact on 
the optics hierarchy, making it simpler and more expressive at the same time!

## Optics hierarchy

In the current version of [Monocle](https://github.com/julien-truffaut/Monocle), we support the following 
optics:

![Optics hierarchy with size](/images/diagrams//monocle2-optics-hierarchy.svg)

It is a lot of names and relationships to learn! Even after years of experience, it is intimidating.
Even worse, there is maybe twice that numbers of optics in other libraries: `Review`, `Equivalent`, 
`NonEmptyTraversal`, `NonEmptyFold`, `OptionalGetter`, `Grate`, `ChromaticLens`, ...

Something that always bothered me about Monocle subset is the lack of symmetry. It becomes more clear
when we group optics by number of elements it targets.

![Optics hierarchy with size](/images/diagrams//monocle2-missing-optics-1.svg)

We have 3 optics for exactly one target (`Iso`, `Lens` and `Getter`), 
3 optics for 0 or more targets (`Setter`, `Fold` and `Traversal`), 
but 2 optics for 0 or 1 target (`Prism` and `Optional`).

We have optics for 1, 0-1, 0-n targets, but no optics for 1-n targets.

Here is how the hierarchy would look like if add those missing pieces.

|    # Targets  | Read-Only  | Read-Write | Write    |
| ------------- |:----------:|:----------:|:--------:|
| **1**         | `Getter`   | `Iso`, `Lens`     | -        |
| **0-1**       | -          | `Optional`, `Prism` | -        |
| **0-n**       | `Fold`     | `Traversal` | `Setter` |




![Optics hierarchy with size](/images/diagrams//optics-hierarchy-size.svg)

Adding optics blow up the number of compose methods.