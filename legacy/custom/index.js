const path = require("path");

module.exports = {
  //窗体title
  title: "OSS Browser",

  //app id，打包名称前缀
  appId: "oss-browser",

  // 应用版本号（优先于 package.json）
  version: "2.0.0",

  //app名称
  appName: "OSS浏览器（定制版）",

  //logo png 格式, 主要用于mac和linux系统
  logo_png: path.join(__dirname, "./icon.png"),

  //logo icns 格式，主要用于mac系统
  logo_icns: path.join(__dirname, "./icon.icns"),

  //logo ico 格式，主要用于windows系统
  logo_ico: path.join(__dirname, "./icon.ico"),

  //“关于”弹窗的主要内容
  about_html:
    '<div style="line-height:1.6;color:#666;font-size:12px;">' +
    "<div>基于开源项目 aliyun/oss-browser 定制，非阿里云官方产品。</div>" +
    '<div>开源协议：Apache License 2.0</div>' +
    '<div>仓库：https://github.com/HyhBlazing/hyh-aliyun-oss-browser</div>' +
    "</div>",
};
