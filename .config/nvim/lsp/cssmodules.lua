---@type vim.lsp.Config
return {
	cmd = { "cssmodules-language-server", "--stdio" },
	filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
	root_markers = { "tailwind.config.js", "tailwind.config.ts", "postcss.config.js", "postcss.config.ts" },
}
