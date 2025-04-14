return {
	"yetone/avante.nvim",
	event = "VeryLazy",
	version = false,
	opts = {
		provider = "openai",
		openai = {
			endpoint = "https://ark.cn-beijing.volces.com/api/v3",
			model = "deepseek-v3-250324",
			temperature = 0,
			max_tokens = 4096,
			api_key_name = "ARK_KEY",
		},
		behaviour = {
			auto_suggestions = false, -- Experimental stage
			auto_set_highlight_group = true,
			auto_set_keymaps = true,
			auto_apply_diff_after_generation = true,
			support_paste_from_clipboard = false,
		},
		windows = {
			sidebar_header = {
				enabled = false,
			},
		},
	},
	build = "make",
	dependencies = {
		"nvim-treesitter/nvim-treesitter",
		"stevearc/dressing.nvim",
		"nvim-lua/plenary.nvim",
		"MunifTanjim/nui.nvim",
	},
}
