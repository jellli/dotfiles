local ensure_installed = {
	"zls",
	"rust-analyzer",
	"cssmodules-language-server",
	-- "json-lsp",
	"html-lsp",
	"css-lsp",
	"tailwindcss-language-server",
	"emmet-ls",
	-- "yamlls",
	"stylua",
	"biome",
	"marksman",
	"typescript-language-server",
	"lua-language-server",
}
--- @type LazySpec
return {
	"williamboman/mason.nvim",
	dependencies = {
		"WhoIsSethDaniel/mason-tool-installer.nvim",
		{ "j-hui/fidget.nvim", opts = {} },
	},
	config = function()
		require("mason").setup()
		require("mason-tool-installer").setup({
			ensure_installed = ensure_installed,
		})
	end,
}
