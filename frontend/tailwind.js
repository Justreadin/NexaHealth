
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#2563eb',
                        secondary: '#1e40af',
                        accent: '#3b82f6',
                        dark: '#1e293b',
                        light: '#f8fafc',
                        verified: '#10b981',
                        flagged: '#ef4444',
                        partial: '#f59e0b',
                        conflict: '#f97316',
                        unknown: '#64748b'
                    },
                    fontFamily: {
                        sans: ['Poppins', 'sans-serif'],
                        serif: ['Playfair Display', 'serif'],
                    },
                    animation: {
                        'pulse-slow': 'pulse 3s infinite',
                        'ripple': 'ripple 2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                        'float': 'float 6s ease-in-out infinite',
                    },
                    keyframes: {
                        ripple: {
                            '0%': { transform: 'scale(0.8)', opacity: '1' },
                            '100%': { transform: 'scale(2.4)', opacity: '0' },
                        },
                        float: {
                            '0%, 100%': { transform: 'translateY(0)' },
                            '50%': { transform: 'translateY(-10px)' },
                        }
                    }
                }
            }
        }
    