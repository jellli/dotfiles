-- Cute code action floating window.
return {
	{
		"rachartier/tiny-code-action.nvim",
		event = "LspAttach",

		opts = {
			picker = {
				"buffer",
				opts = {
					hotkeys = true,
					-- Use numeric labels.
					hotkeys_mode = function(titles)
						return vim.iter(ipairs(titles))
							:map(function(i)
								return tostring(i)
							end)
							:totable()
					end,
					auto_preview = true,
				},
			},
			backend = "delta",
			backend_opts = {
				delta = {
					header_lines_to_remove = 4,
				},
			},
		},
		keys = {
			{
				"<leader>ca",
				mode = { "n", "x" },
				function()
					require("tiny-code-action").code_action()
				end,
			},
		},
	},
}
