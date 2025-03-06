return {
	"jellli/tmux-picker.nvim",
	config = function()
		local tmux_picker = require("tmux-picker")
		vim.keymap.set("n", "<leader>ts", tmux_picker.pick_session, { desc = "Pick tmux session" })
	end,
}
