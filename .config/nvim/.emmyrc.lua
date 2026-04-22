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
			opt .. "/friendly-snippets",
			opt .. "/fzf-lua",
			opt .. "/gitsigns.nvim",
			opt .. "/gruvbox-material",
			opt .. "/leap.nvim",
			opt .. "/mason.nvim",
			opt .. "/mini.ai",
			opt .. "/mini.files",
			opt .. "/mini.pairs",
			opt .. "/neocodeium",
			opt .. "/nvim-surround",
			opt .. "/nvim-treesitter",
			opt .. "/nvim-ts-autotag",
			opt .. "/nvim-web-devicons",
			opt .. "/plenary.nvim",
			opt .. "/quicker.nvim",
			opt .. "/smart-splits.nvim",
			opt .. "/tabout.nvim",
			opt .. "/tiny-cmdline.nvim",
			opt .. "/treesj",
			opt .. "/vim-fugitive",
			opt .. "/yanky.nvim",
		},
	},
	diagnostics = {
		disable = {
			"unnecessary-if",
		},
	},
}
