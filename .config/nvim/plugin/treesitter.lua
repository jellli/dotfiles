local later = require("queue").later
local now = require("queue").now

vim.g.ts_enable = {
	auto_init = true,
	auto_install = true,
	highlights = true,
	regex_syntax = false,
	folds = true,
	parser_info = vim.fn.stdpath("config") .. "/treesitter-parsers.json",
	parser_settings = {},
}

now(function()
	vim.pack.add({
		{
			src = "https://github.com/VonHeikemen/ts-enable.nvim",
			version = "v2.x",
		},
	})
end)

later(function()
	vim.g.matchup_treesitter_stopline = 500

	vim.pack.add({
		"https://github.com/wansmer/treesj",
		"https://github.com/windwp/nvim-ts-autotag",
		"https://github.com/andymass/vim-matchup",
	})
	require("treesj").setup({
		use_default_keymaps = false,
		max_join_length = 200,
	})
	Jili.keymap("n", "<leader>sj", "<cmd>TSJToggle<cr>", "Toggle split/join")

	require("nvim-ts-autotag").setup({
		opts = {
			enable_close = true,
			enable_rename = true,
			enable_close_on_slash = true,
		},
	})
end)
