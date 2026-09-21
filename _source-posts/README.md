# 文章源稿

当前仓库存放 Hexo 生成后的静态站点，不包含原 Hexo 工程。这一目录保留新增文章的 Markdown 源稿，供后续编辑或迁回原工程。

恢复原 Hexo 发布流程时，将文章复制到原工程的 `source/_posts/`，保留 front matter 中的标题、日期、标签和 permalink，然后重新生成站点。不要只重新生成旧工程，否则缺失于旧工程的新文章和索引可能被覆盖。

目录以下划线开头，避免 GitHub Pages 的默认 Jekyll 处理将带 front matter 的源稿再次生成为同一路径的页面。依据：[Jekyll 目录规则](https://jekyllrb.com/docs/structure/)。
