require("pack").add({
	{
		src = "https://github.com/nvim-mini/mini.pairs",
		after = function()
			require("mini.pairs").setup({})
		end,
	},
})
