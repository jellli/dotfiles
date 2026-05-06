require("pack").add({
	{
		src = "https://github.com/kylechui/nvim-surround",
		after = function()
			require("nvim-surround").setup({})
		end,
	},
})
