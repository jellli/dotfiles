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
	"neovim/nvim-lspconfig",
	{
		"williamboman/mason.nvim",
		dependencies = {
			"WhoIsSethDaniel/mason-tool-installer.nvim",
		},
		config = function()
			require("mason").setup()
			require("mason-tool-installer").setup({
				ensure_installed = ensure_installed,
			})
		end,
	},
}
