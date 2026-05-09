require("pack").add({
	{
		src = "https://codeberg.org/andyg/leap.nvim",
		after = function()
			local keymap = Jili.keymap
			keymap({ "n", "x", "o" }, "s", "<Plug>(leap)")
			keymap("n", "S", "<Plug>(leap-anywhere)")
			keymap({ "x", "o" }, "R", function()
				require("leap.treesitter").select({
					opts = require("leap.user").with_traversal_keys("R", "r"),
				})
			end)
		end,
	},
	-- {
	-- 	src = {
	-- 		{ src = "https://github.com/vieitesss/miniharp.nvim", version = vim.version.range("v*") },
	-- 	},
	-- 	after = function()
	-- 		local miniharp = require("miniharp")
	-- 		miniharp.setup({
	-- 			autoload = true,
	-- 			autosave = true,
	-- 			show_on_autoload = false,
	-- 			ui = {
	-- 				position = "top-right",
	-- 				show_hints = false,
	-- 				enter = false,
	-- 			},
	-- 		})
	-- 		local keymap = Jili.keymap
	-- 		keymap("n", "<leader>ma", miniharp.toggle_file, "miniharp: toggle file mark")
	-- 		keymap("n", "<C-n>", miniharp.next, "miniharp: next mark")
	-- 		keymap("n", "<C-p>", miniharp.prev, "miniharp: prev mark")
	-- 		keymap("n", "<leader>ml", miniharp.show_list, "miniharp: show list")
	-- 		keymap("n", "<leader>mL", miniharp.enter_list, "miniharp: enter list")
	--
	-- 		keymap("n", "<leader>1", function()
	-- 			miniharp.go_to(1)
	-- 		end, "miniharp: go to 1")
	-- 		keymap("n", "<leader>2", function()
	-- 			miniharp.go_to(2)
	-- 		end, "miniharp: go to 2")
	-- 		keymap("n", "<leader>3", function()
	-- 			miniharp.go_to(3)
	-- 		end, "miniharp: go to 3")
	-- 		keymap("n", "<leader>4", function()
	-- 			miniharp.go_to(4)
	-- 		end, "miniharp: go to 4")
	-- 	end,
	-- },
	{
		src = "https://github.com/unblevable/quick-scope",
	},
})
