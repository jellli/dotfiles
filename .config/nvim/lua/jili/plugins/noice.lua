return {
	"folke/noice.nvim",
	event = "VeryLazy",
	opts = {
		cmdline = {
			-- view = "cmdline",
			border = {
				style = "double",
			},
		},
		messages = {
			view = "mini",
			view_error = "mini", -- view for errors
			view_warn = "mini", -- view for warnings
			view_history = "messages", -- view for :messages
			view_search = "virtualtext", -- view for search count messages. Set to `false` to disable
		},
		notify = {
			enabled = true,
			view = "mini",
		},
		popupmenu = {
			backend = "cmp",
		},
		lsp = {
			messages = {
				enabled = true,
				view = "mini",
			},
		},
		preset = {
			bottom_search = true,
			command_palette = true,
			long_message_to_split = true,
			lsp_doc_border = true,
		},
	},
	dependencies = {
		-- if you lazy-load any plugin below, make sure to add proper `module="..."` entries
		"MunifTanjim/nui.nvim",
		-- OPTIONAL:
		--   `nvim-notify` is only needed, if you want to use the notification view.
		--   If not available, we use `mini` as the fallback
		"rcarriga/nvim-notify",
	},
}
