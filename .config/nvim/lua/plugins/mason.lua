local ensure_installed = {
	"rust-analyzer",
	"cssmodules-language-server",
	"html-lsp",
	"css-lsp",
	"tailwindcss-language-server",
	"emmet-ls",
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
		"neovim/nvim-lspconfig",
	},
	config = function()
		require("mason").setup()
		require("mason-tool-installer").setup({
			ensure_installed = ensure_installed,
		})
	end,
}
