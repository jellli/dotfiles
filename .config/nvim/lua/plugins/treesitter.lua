return {
	"nvim-treesitter/nvim-treesitter",
	build = ":TSUpdate",
	main = "nvim-treesitter.configs", -- Sets main module to use for opts
	opts = {
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
			"lua"
		},
		auto_install = true,
	},
}
