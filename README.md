# Tips

This's a somewhat brief tips document on how to get up and running quickly. That said, it does not go into the nuances of how hugo works. For more details, [please see the docs](https://gohugo.io/content-management/organization/).

> If you need to make changes from a text editor, edit files in the **content** directory and add media file in the **static/images** directory. Else, use forestry.io for editing.

[Here is another useful resource to understand hugo's directory structure](https://gohugo.io/getting-started/directory-structure/)

## Edit the pages
To edit this site, you will use **[markdown](https://www.makeuseof.com/tag/printable-markdown-cheat-sheet/)** and **[shortcodes](https://gohugo.io/content-management/shortcodes/)**.

## Hide page from archive

There are two approaches of achieving this:

1. set `index` to `false` in the front matter of a post like so:

    ```toml
    index = false
    ```

    and if using yaml

    ```yaml
    index: false
    ```

2. Publish a future dated post. Since hugo [doesn't generate future authored posts by default](https://gohugo.io/getting-started/usage/#draft-future-and-expired-content), you would have to be explicit with hugo. 

    If using [netlify to build your site](https://gohugo.io/hosting-and-deployment/hosting-on-netlify/) ,for example, you would add the following line in the `netlify.toml` [script](https://gohugo.io/hosting-and-deployment/hosting-on-netlify/)

    ```
    HUGO_BUILDFUTURE = "true"
    ``` 

## Publish New Course

Add the course in the `course.yaml` in the `data` directory

Then from your post add a `course` field in the front matter that matches whatever the **name** of your course is.

## Add new page with front matter fields pre-filled

```zsh
hugo new title-of-new-page.md
```

## Socia Media Previews

Follow this basic principles.

1. Don't use svgs for social media shares. If a page `image` holds an svg value, use `seoimage` to set a different image.
2. A good title should be at least 30 characters long and at tost 90 characters long. 