vim.pack.add({
	"https://github.com/folke/flash.nvim",
})

require("flash").setup({})

Jili.keymap({ "n", "x", "o" }, "s", require("flash").jump, "Flash Jump")
