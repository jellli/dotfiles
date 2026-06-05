local data = os.getenv("XDG_DATA_HOME") or (os.getenv("HOME") .. "/.local/share")
local opt = data .. "/nvim/site/pack/core/opt"

return {
	runtime = {
		version = "LuaJIT",
	},
	workspace = {
		library = {
			"$VIMRUNTIME",
			opt .. "/blink.cmp",
			opt .. "/codecompanion.nvim",
			opt .. "/codediff.nvim",
			opt .. "/conform.nvim",
			opt .. "/ex-colors.nvim",
			opt .. "/fzf-lua",
			opt .. "/gitsigns.nvim",
			opt .. "/gruvbox-material",
			opt .. "/indent-blankline.nvim",
			opt .. "/leap.nvim",
			opt .. "/mini.ai",
			opt .. "/mini.clue",
			opt .. "/mini.files",
			opt .. "/mini.input",
			opt .. "/mini.pairs",
			opt .. "/mini.splitjoin",
			opt .. "/neocodeium",
			opt .. "/nvim-bqf",
			opt .. "/nvim-surround",
			opt .. "/nvim-treesitter",
			opt .. "/nvim-ts-autotag",
			opt .. "/nvim-web-devicons",
			opt .. "/quick-scope",
			opt .. "/quicker.nvim",
			opt .. "/render-markdown.nvim",
			opt .. "/smart-splits.nvim",
			opt .. "/tabout.nvim",
			opt .. "/treesj",
			opt .. "/ts-enable.nvim",
			opt .. "/yanky.nvim",
		},
	},
	diagnostics = {
		disable = {
			"unnecessary-if",
		},
	},
}
