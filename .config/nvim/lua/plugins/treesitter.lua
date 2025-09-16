return {
	{
		"nvim-treesitter/nvim-treesitter",
		build = ":TSUpdate",
		main = "nvim-treesitter.configs", -- Sets main module to use for opts
		opts = {
			highlight = { enable = true },
			ensure_installed = {
				"python",
				"javascript",
				"typescript",
				"toml",
				"json",
				"gitignore",
				"yaml",
				"bash",
				"tsx",
				"css",
				"html",
				"lua",
			},
			auto_install = true,
			indent = {
				enable = true,
			},
		},
	},
	--[[ {
		"nvim-treesitter/nvim-treesitter-context",
		config = function()
			require("treesitter-context").setup({})
		end,
	}, ]]
}
