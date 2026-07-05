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
