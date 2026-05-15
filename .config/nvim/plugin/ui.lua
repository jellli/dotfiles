local later = require("q").later
local now = require("q").now

now(function()
	vim.pack.add({
		"https://github.com/rachartier/tiny-cmdline.nvim",
	})
end)

later(function()
	vim.pack.add({
		"https://github.com/lukas-reineke/indent-blankline.nvim",
		"https://github.com/nvim-tree/nvim-web-devicons",
		"https://github.com/nvim-mini/mini.clue",
		"https://github.com/mrjones2014/smart-splits.nvim",
	})

	require("ibl").setup({
		indent = {
			char = "│",
			tab_char = "│",
		},
		scope = {
			enabled = true,
			show_start = false,
			show_end = false,
		},
	})

	local miniclue = require("mini.clue")
	miniclue.setup({
		triggers = {
			{ mode = { "n", "x" }, keys = "<Leader>" },
			{ mode = "n", keys = "[" },
			{ mode = "n", keys = "]" },
			{ mode = "i", keys = "<C-x>" },
			{ mode = { "n", "x" }, keys = "g" },
			{ mode = { "n", "x" }, keys = "'" },
			{ mode = { "n", "x" }, keys = "`" },
			{ mode = { "n", "x" }, keys = '"' },
			{ mode = { "i", "c" }, keys = "<C-r>" },
			{ mode = "n", keys = "<C-w>" },
			{ mode = { "n", "x" }, keys = "z" },
		},
		clues = {
			miniclue.gen_clues.square_brackets(),
			miniclue.gen_clues.builtin_completion(),
			miniclue.gen_clues.g(),
			miniclue.gen_clues.marks(),
			miniclue.gen_clues.registers(),
			miniclue.gen_clues.windows(),
			miniclue.gen_clues.z(),
		},
	})

	require("smart-splits").setup({})

	local keymap = Jili.keymap
	keymap("n", "<M-h>", function()
		require("smart-splits").resize_left()
	end)
	keymap("n", "<M-j>", function()
		require("smart-splits").resize_down()
	end)
	keymap("n", "<M-k>", function()
		require("smart-splits").resize_up()
	end)
	keymap("n", "<M-l>", function()
		require("smart-splits").resize_right()
	end)

	keymap("n", "<C-h>", function()
		require("smart-splits").move_cursor_left()
	end)
	keymap("n", "<C-j>", function()
		require("smart-splits").move_cursor_down()
	end)
	keymap("n", "<C-k>", function()
		require("smart-splits").move_cursor_up()
	end)
	keymap("n", "<C-l>", function()
		require("smart-splits").move_cursor_right()
	end)
	keymap("n", "<C-\\>", function()
		require("smart-splits").move_cursor_previous()
	end)
end)
