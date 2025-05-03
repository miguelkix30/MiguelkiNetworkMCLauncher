/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

let console_log = console.log;
let console_info = console.info;
let console_warn = console.warn;
let console_debug = console.debug;
let console_error = console.error;

// Función para sanitizar rutas de archivo en los logs
function sanitizePaths(value) {
    if (typeof value !== 'string') return value;
    
    // Patrones de rutas que queremos ocultar
    const patterns = [
        // Rutas Windows (C:\Users\username\...)
        /[A-Z]:\\Users\\[^\\]+\\[^\\]+/gi,
        // Rutas absolutas en general
        /\/(Users|home)\/[^\/]+\/[^\/]+/gi,
        // Rutas de appdata específicas
        /AppData\\(Local|Roaming)\\[^\\]+/gi,
        /\/\.config\/[^\/]+/gi
    ];
    
    let result = value;
    for (const pattern of patterns) {
        result = result.replace(pattern, path => {
            // Extrae solo el nombre del archivo/carpeta final
            const parts = path.split(/[\\\/]/);
            const lastTwo = parts.slice(-2).join('/');
            return `.../${lastTwo}`;
        });
    }
    
    return result;
}

class logger {
    constructor(name, color) {
        this.Logger(name, color)
    }

    async Logger(name, color) {
        console.log = value => {
            console_log.call(console, `%c[${name}]:`, `color: ${color};`, sanitizePaths(value));
        };

        console.info = value => {
            console_info.call(console, `%c[${name}]:`, `color: ${color};`, sanitizePaths(value));
        };

        console.warn = value => {
            console_warn.call(console, `%c[${name}]:`, `color: ${color};`, sanitizePaths(value));
        };

        console.debug = value => {
            console_debug.call(console, `%c[${name}]:`, `color: ${color};`, sanitizePaths(value));
        };

        console.error = value => {
            console_error.call(console, `%c[${name}]:`, `color: ${color};`, sanitizePaths(value));
        };
    }
}

export default logger;