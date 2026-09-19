// Lightweight, safe syntax highlighting for JSON.
export const highlightJson = (jsonString: string): string => {
    if (!jsonString) return ''

    let safeStr = jsonString
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    return safeStr.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        (match) => {
            let cls = 'text-amber-400'

            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'text-blue-500 font-medium' // keys
                } else {
                    cls = 'text-emerald-500' // string values
                }
            } else if (/true|false/.test(match)) {
                cls = 'text-purple-500 font-bold' // booleans
            } else if (/null/.test(match)) {
                cls = 'text-gray-500 italic' // null
            } else {
                cls = 'text-cyan-500' // numbers
            }

            return `<span class="${cls}">${match}</span>`
        }
    )
}

// Pretty-print arbitrary JSON-ish values for the terraform state /
// outputs / raw-logs blocks. The backend persists these as TEXT
// columns, so they arrive as either:
//
//  * a JSON string (terraform state pulled from the pg backend, or the
//    JSON-stringified outputs map),
//  * a real object/array (when the API layer has already parsed it),
//  * a plain non-JSON string (a stack trace, a single error line),
//  * null / undefined when the worker had nothing to record.
//
// The helper unifies those into a 2-space-indented JSON dump when the
// payload parses, and falls back to the raw text otherwise so we never
// clobber a non-JSON string by trying to parse it.
export const prettyJson = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value, null, 2)
        } catch {
            return String(value)
        }
    }
    if (typeof value === 'string') {
        const trimmed = value.trim()
        // Cheap pre-check: only attempt JSON.parse on strings that look
        // like JSON. Saves a try/catch round-trip for ordinary log
        // text and avoids accidentally parsing a bare number or "null"
        // string into something the consumer didn't expect.
        if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
            try {
                return JSON.stringify(JSON.parse(trimmed), null, 2)
            } catch {
                return value
            }
        }
        return value
    }
    return String(value)
}
