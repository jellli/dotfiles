return {
	"smjonas/inc-rename.nvim",
	opts = {
		input_buffer_type = "snacks",
	},
	keys = {
		{ "<leader>rn", ":IncRename ", desc = "Rename", mode = { "n", "v" } },
	},
}
