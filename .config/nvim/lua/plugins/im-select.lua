return {
	"keaising/im-select.nvim",
	config = function()
		local os_name = vim.loop.os_uname().sysname
		if os_name == "Darwin" then
			return require("im_select").setup({
				default_im_select = "com.apple.keylayout.ABC",
				default_command = "macism",
				set_default_events = { "InsertLeave", "CmdlineLeave", "FocusGained" },
				set_previous_events = {},
				keep_quiet_on_no_binary = false,
				async_switch_im = true,
			})
		end
	end,
}
