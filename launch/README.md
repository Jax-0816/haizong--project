# Launch Guide / 启动指南

This is a local launcher package for Windows PCs.  
这是给 Windows 电脑准备的本地启动包。

## Before You Start / 使用前

- Install Node.js 20 or later: [https://nodejs.org/](https://nodejs.org/)  
  先安装 Node.js 20 或更高版本。
- Keep the entire project folder intact — do not move individual files.  
  把整个项目文件夹完整保留，不要只拷贝单个文件。
- Make sure `package.json` exists in the project root.  
  确认项目根目录里有 `package.json`。

## How to Start / 启动方式

1. Go back to the project root folder and double-click **`START-HERE.bat`**  
   回到项目根目录，双击 **`START-HERE.bat`**
2. Or open this `launch/` folder and double-click **`start.bat`**  
   或者打开这个 `launch/` 文件夹，双击 **`start.bat`**
3. The first run may install dependencies — please wait for it to finish.  
   第一次运行时如果提示安装依赖，请等待完成。
4. Your browser will automatically open to `http://127.0.0.1:4280/`  
   浏览器会自动打开到 `http://127.0.0.1:4280/`

## How to Stop / 停止方式

- Close the command prompt window that opened.  
  直接关闭弹出的命令行窗口。

## FAQ / 常见问题

| Problem | Solution |
|---------|----------|
| "npm not found" | Install Node.js: [https://nodejs.org/](https://nodejs.org/) |
| Blank page after opening | Check the command window for error messages |
| Port already in use | Close other local services and retry |
| Garbled filenames after extracting | Use **7-Zip** or **Bandizip** to extract (they support UTF-8 encoding). Windows built-in extractor may corrupt non-English filenames. |
| 解压后文件名乱码 | 请使用 **7-Zip** 或 **Bandizip** 解压。Windows 自带解压工具可能不兼容中文文件名。 |

## Note / 说明

This is a local development server version — not a standalone installer or EXE.  
For long-term sharing, consider building a production deployment package later.  

这个包是"本地运行版"，不是独立安装程序，也不是 EXE。  
如果要长期分享使用，后续可以再做生产版部署包。
