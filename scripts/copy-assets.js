const fs = require('fs');
const path = require('path');

function copyFile(src, dest) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    console.log(`✅ Copied: ${src} -> ${dest}`);
}
function copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        
        if (fs.statSync(srcPath).isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            copyFile(srcPath, destPath);
        }
    });
}
function copyAssets() {
    console.log('📁 Copying static assets...');

    try {
        // 复制HTML文件
        copyFile(
            path.join(__dirname, '../src/renderer/index.html'),
            path.join(__dirname, '../dist/renderer/index.html')
        );

        // 复制CSS文件
        copyFile(
            path.join(__dirname, '../src/renderer/style.css'),
            path.join(__dirname, '../dist/renderer/style.css')
        );

        // 确保组件目录存在并复制JS文件
        const componentsDir = path.join(__dirname, '../dist/renderer/components');
        if (!fs.existsSync(componentsDir)) {
            fs.mkdirSync(componentsDir, { recursive: true });
        }

        console.log('✅ Static assets copied successfully!');
        // 新增：复制脚本文件
        const scriptsSourceDir = path.join(__dirname, '../src/main/plugins/message/tencent/scripts');
        const scriptsDestDir = path.join(__dirname, '../dist/main/plugins/message/tencent/scripts');

        if (fs.existsSync(scriptsSourceDir)) {
            copyDirectory(scriptsSourceDir, scriptsDestDir);
            console.log('✅ Script files copied successfully!');
        } else {
            console.warn('⚠️ Scripts directory not found:', scriptsSourceDir);
        }

        console.log('✅ Static assets copied successfully!');
    } catch (error) {
        console.error('❌ Error copying assets:', error);
        process.exit(1);
    }
}

copyAssets();