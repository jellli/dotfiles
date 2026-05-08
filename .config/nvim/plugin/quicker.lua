require("pack").add({
	{
		src = {
			"https://github.com/stevearc/quicker.nvim",
			"https://github.com/kevinhwang91/nvim-bqf",
		},
		filetype = "qf",
		after = function()
			require("quicker").setup()
			-- require
		end,
	},
})
