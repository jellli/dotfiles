return {
	"sindrets/diffview.nvim",
	keys = {
		{
			"<leader>dt",
			function()
				local diffview = require("diffview")
				if next(require("diffview.lib").views) == nil then
					vim.cmd("DiffviewOpen")
				else
					vim.cmd("DiffviewClose")
				end
			end,
			desc = "Diff view",
		},
	},
}
