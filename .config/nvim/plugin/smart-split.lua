require("pack").add({
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
