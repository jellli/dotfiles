return {
	"atiladefreitas/dooing",
	config = function()
		require("dooing").setup({
			window = {
				border = "single",
				width = 90,
			},
		})
	end,
}
