/**
 * 新手导读：这是 Tailwind CSS 的运行时配置，不是聊天业务代码。
 *
 * index.html 先加载 Tailwind CDN，再加载本文件。本文件向 Tailwind 补充项目专用的
 * 字体和动画名称，因此 HTML 中的 animate-fade-in 等类名才能工作。keyframes 描述
 * 动画从开始到结束的样子，animation 则为动画指定时长和速度。
 *
 * 修改或新增名称时，要同时搜索 index.html 和 src/app 中的使用位置；如果只改这里，
 * 旧类名会失效。这个对象由浏览器直接读取，所以不要改成 Node.js 模块写法。
 */
tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: { sans: ['"SF Pro Display"','"SF Pro"','-apple-system','BlinkMacSystemFont','"Segoe UI"','sans-serif'] },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-out',
                'slide-up': 'slideUp 0.4s cubic-bezier(0.4,0,0.2,1)',
                'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
            },
            keyframes: {
                fadeIn: { '0%': {opacity:'0',transform:'translateY(6px)'}, '100%': {opacity:'1',transform:'translateY(0)'} },
                slideUp: { '0%': {opacity:'0',transform:'translateY(16px)'}, '100%': {opacity:'1',transform:'translateY(0)'} },
                pulseDot: { '0%,100%': {opacity:1}, '50%': {opacity:0.3} },
            }
        }
    }
}
