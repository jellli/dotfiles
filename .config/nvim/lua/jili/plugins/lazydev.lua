return {
	"folke/lazydev.nvim",
	ft = "lua", -- only load on lua files
	opts = {
		library = {
			{ path = "snacks.nvim", words = { "Snacks" } },
		},
	},
}
