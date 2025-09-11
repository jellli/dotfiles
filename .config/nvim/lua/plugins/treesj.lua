-- Split/join blocks of code.

return {
	"Wansmer/treesj",
	keys = {
		{
			"n",
			"<space>sj",
			function()
				require("treesj").toggle()
			end,
		},
	},
	dependencies = { "nvim-treesitter/nvim-treesitter" }, -- if you install parsers with `nvim-treesitter`
	config = function()
		require("treesj").setup({})
	end,
}
