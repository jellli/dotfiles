-- Task runner.
return {
	{
		"stevearc/overseer.nvim",
		opts = {
			-- Setup DAP later when lazy-loading the plugin.
			dap = false,
			task_list = {
				default_detail = 2,
				direction = "bottom",
				max_width = { 600, 0.7 },
				bindings = {
					["<C-b>"] = "ScrollOutputUp",
					["<C-f>"] = "ScrollOutputDown",
					["H"] = "IncreaseAllDetail",
					["L"] = "DecreaseAllDetail",
					-- Disable mappings I don't use.
					["g?"] = false,
					["<C-l>"] = false,
					["<C-h>"] = false,
					["{"] = false,
					["}"] = false,
				},
			},
			form = {
				win_opts = { winblend = 0 },
			},
			confirm = {
				win_opts = { winblend = 5 },
			},
			task_win = {
				win_opts = { winblend = 5 },
			},
		},
		keys = {
			{
				"<leader>ot",
				"<cmd>OverseerToggle<cr>",
				desc = "Toggle task window",
			},
			{
				"<leader>or",
				function()
					local overseer = require("overseer")

					overseer.run_template({}, function(task)
						if task then
							overseer.open({ enter = false })
						end
					end)
				end,
				desc = "Run task",
			},
		},
	},
}
