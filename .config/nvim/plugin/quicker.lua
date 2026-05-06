require("pack").add({
	{
		src = "https://github.com/stevearc/quicker.nvim",
		after = function()
			require("quicker").setup()
		end,
	},
})
