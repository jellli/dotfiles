return {
  "A7Lavinraj/fyler.nvim",
  ---@module 'fyler'
  ---@type FylerSetupOptions
  branch = "stable",
  dependencies = { "nvim-mini/mini.icons" },
  opts = {
	explorer = {
		confirm_simple = true,
		},
		views ={
	mappings = {
    ["#"] = "CollapseAll",
    ["-"] = "CloseView",
    ["<C-h>"] = "SelectSplit",
    ["<C-v>"] = "SelectVSplit",
    ["<CR>"] = "Select",
    ["l"] = "Select",
		["h"] = "GotoParent",

	},
		},
  },
	keys ={
					{ "-", function() require("fyler").open() end, { desc = "Fyler Open" }}
	},
--					{ "<leader>e", function() fyler.open({ kind = "split_left_most" }) end, { desc = "Fyler Open" }},
}

