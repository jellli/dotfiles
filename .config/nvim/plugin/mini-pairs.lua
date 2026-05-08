require("pack").add({
	{
		src = "https://github.com/nvim-mini/mini.pairs",
		event = { "InsertEnter" },
		after = function()
			require("mini.pairs").setup({})
		end,
	},
})
