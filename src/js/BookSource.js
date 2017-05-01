define(['co', "utils", 'Chapter'], function(co, utils, Chapter) {
  "use strict"


  // **** BookSource *****
  class BookSource{

    constructor(book, bookSourceManager, id, weight=0){

      this.bookSourceManager = bookSourceManager; // 不持久化
      this.book = book; // 不持久化

      this.id = id; // 书源 ID
      this.detailLink; // 详情页链接
      this.catalogLink; // 目录页链接
      this.bookid; // 书籍 ID
      this.catalog; // 目录
      this.lastestChapter = undefined;  // 最新的章节

      this.weight = weight; // 书源的权重
      this.__disable = false; // 表示当前书源是否可用
      this.__searched = false; // 本书是否已经被搜索到了
      this.__updatedCatalogTime = 0; // 上次更新目录时间
      this.__updatedLastestChapterTime = 0; // 上次更新最新章节时间
      this.needSaveCatalog = false; // 目录是否需要存储到本地
    }


    // 确保当前源已经获取到足够的数据
    __assertBookSource(){

      utils.log(`BookSource: assert myself`);

      if(this.__disable)
        return Promise.reject(404);

      if(this.__searched)
        return Promise.resolve();

      return this.bookSourceManager.getBook(this.id, this.book.name, this.book.author)
        .then(book => {
          // 找到书籍了
          Object.assign(this, book.sources[this.id]);
          return this;
        })
        .catch(error => {
          if(error == 404){
            // 没找到该书就标记一下，下次直接跳过
            this.__disable = true;
            this.__searched = true;
          }
          return Promise.reject(error);
        });
    }

    // 获取书籍信息
    getBookInfo(){
      return this.__assertBookSource()
        .then(() =>
        this.bookSourceManager.getBookInfo(this.id, this));
    }

    // 确保当前书籍指定的目录页的链接
    __assertBookSourceCatalogLink(){
      if(this.catalogLink === undefined)
        return this.bookSourceManager.getBookCatalogLink(this.id, this)
          .then(cl => (this.catalogLink = cl));
      else
        return Promise.resolve();
    }

    // 获取目录
    // options:
    // * forceRefresh 强制刷新
    getCatalog(forceRefresh){
      if(!forceRefresh && this.catalog)
        return Promise.resolve(this.catalog);

      let self = this;
      return co(function*(){
        yield self.__assertBookSource();
        if(!forceRefresh && (new Date()).getTime() - self.__updatedCatalogTime < BookSource.settings.refreshCatalogInterval * 1000)
          return self.catalog;

        yield self.__assertBookSourceCatalogLink();

        const catalog = yield self.bookSourceManager.getBookCatalog(self.id, self);
        self.catalog = catalog;
        self.__updatedCatalogTime = (new Date()).getTime();
        self.needSaveCatalog = true;
        return catalog;
      });
    }

    // 获取书籍最新章节
    refreshLastestChapter(forceRefresh=false){

      if(!forceRefresh && (new Date()).getTime() - this.__updatedLastestChapterTime < BookSource.settings.refreshLastestChapterInterval * 1000)
        return [this.lastestChapter, false];

      utils.log('Refresh LastestChapter!');

      return this.__assertBookSource()
        .then(() =>
          this.bookSourceManager.getLastestChapter(this.id, this))
        .then(lastestChapter => {
          this.__updatedLastestChapterTime = (new Date()).getTime();
          let lastestChapterUpdated = false;
          if(this.lastestChapter != lastestChapter){
            this.lastestChapter = lastestChapter;
            lastestChapterUpdated = true;
          }
          return [lastestChapter, lastestChapterUpdated];
        });
    }


    // 从本地或网络上获取章节内容
    // * cacheDir 缓存章节的目录
    // * onlyCacheNoLoad 只缓存章节，不加载章节
    getChapter(chapter, onlyCacheNoLoad){
      // 从缓存中获取章节内容
      return this.__assertBookSource()
        .then(() => co(this.__getCacheChapter(chapter.title, onlyCacheNoLoad)))
        .then(c => onlyCacheNoLoad? chapter: c)
        .catch(error => {
          if(error != 207)
            throw error;
          // 从缓存中获取失败的话，再从网上获取章节，然后缓存到本地
          return this.bookSourceManager.getChapter(this.id, Object.assign({}, this, chapter))
            .then(chapter => // 缓存该章节
              this.__cacheChapter(chapter));
        });
    }

    // 获取章节的缓存位置
    // * cacheDir 缓存章节的目录
    __getCacheChapterLocation(id){
      return `chapter_${this.book.name}.${this.book.author}_${id}.${this.id}`;
    }

    // 获取指定的章节
    // * cacheDir 缓存章节的目录
    // * onlyCacheNoLoad 只缓存章节，不加载章节
    *__getCacheChapter(title, onlyCacheNoLoad){

      const dest = this.__getCacheChapterLocation(title);

      if(onlyCacheNoLoad){
        const exists = yield utils.dataExists(dest, true);
        return exists ? null : Promise.reject(207);
      }

      // 获取章节内容
      try{
        const data = yield utils.loadData(dest, true);
        // 章节存在
        if(!data)
          return Promise.reject(207);

        // 类型转换
        const chapter = Object.assign(new Chapter(), data);
        return chapter;
      }
      catch(e){
        return Promise.reject(207);
      }
    }

    // 缓存章节内容
    // * cacheDir 缓存章节的目录
    __cacheChapter(chapter){

      // 保存到文件中
      const dest = this.__getCacheChapterLocation(chapter.title);
      return utils.saveData(dest, chapter, true).then(() => chapter); // 将 JSON 对象序列化到文件中
    }

  }

  BookSource.settings = {
    refreshCatalogInterval: 60 * 60 * 1, // 单位秒，也就是一个小时
    refreshLastestChapterInterval: 60 * 60 * 1 // 单位秒，也就是一个小时
  };

  // 用于标记持久化的属性
  BookSource.persistentInclude = ["id", "__disable", "weight", "__searched", "detailLink",
              "catalogLink", "bookid", // 不持久化目录 "catalog",
              "__updatedCatalogTime", "__updatedLastestChapterTime",
              "needSaveCatalog", "lastestChapter"];

  return BookSource;
});
