require("pack").add({
	{
		src = "https://github.com/rachartier/tiny-cmdline.nvim",
		sync = true,
	},
	{
		src = "https://github.com/lukas-reineke/indent-blankline.nvim",
		after = function()
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
		end,
	},
	{
		src = "https://github.com/nvim-tree/nvim-web-devicons",
	},
	{
		src = "https://github.com/nvim-mini/mini.clue",
		after = function()
			local miniclue = require("mini.clue")
			miniclue.setup({
				triggers = {
					-- Leader triggers
					{ mode = { "n", "x" }, keys = "<Leader>" },
					-- `[` and `]` keys
					{ mode = "n", keys = "[" },
					{ mode = "n", keys = "]" },
					-- Built-in completion
					{ mode = "i", keys = "<C-x>" },
					-- `g` key
					{ mode = { "n", "x" }, keys = "g" },
					-- Marks
					{ mode = { "n", "x" }, keys = "'" },
					{ mode = { "n", "x" }, keys = "`" },
					-- Registers
					{ mode = { "n", "x" }, keys = '"' },
					{ mode = { "i", "c" }, keys = "<C-r>" },
					-- Window commands
					{ mode = "n", keys = "<C-w>" },
					-- `z` key
					{ mode = { "n", "x" }, keys = "z" },
				},
				clues = {
					-- Enhance this by adding descriptions for <Leader> mapping groups
					miniclue.gen_clues.square_brackets(),
					miniclue.gen_clues.builtin_completion(),
					miniclue.gen_clues.g(),
					miniclue.gen_clues.marks(),
					miniclue.gen_clues.registers(),
					miniclue.gen_clues.windows(),
					miniclue.gen_clues.z(),
				},
			})
		end,
	},
	{
		src = "https://github.com/mrjones2014/smart-splits.nvim",
		after = function()
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
		end,
	},
})

