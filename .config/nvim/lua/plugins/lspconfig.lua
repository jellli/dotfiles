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
	event = { "BufReadPre", "BufNewFile" },
	dependencies = {
		{
			-- `lazydev` configures Lua LSP for your Neovim config, runtime and plugins
			-- used for completion, annotations and signatures of Neovim apis
			"folke/lazydev.nvim",
			ft = "lua",
			opts = {
				library = {
					{ path = "snacks.nvim", words = { "Snacks" } },
					{ path = "lazy.nvim", words = { "LazyVim" } },
				},
			},
		},
		{
			"mason-org/mason.nvim",
			opts = {},
		},
		{
			"WhoIsSethDaniel/mason-tool-installer.nvim",
			opts = {
				ensure_installed = ensure_installed,
			},
		},
		{ "j-hui/fidget.nvim", opts = {} },
		"b0o/schemastore.nvim",
	},
}
