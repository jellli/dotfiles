require("pack").add({
	{
		src = {
			"https://github.com/rafamadriz/friendly-snippets",
			{ src = "https://github.com/saghen/blink.cmp", version = vim.version.range("^1") },
			"https://github.com/abecodes/tabout.nvim",
		},
		id = "completion",
		event = { "InsertEnter", "CmdlineEnter" },
		on_pack_changed = function(args)
			if (args.kind == "install" or args.kind == "update") and args.path == "blink.cmp" then
				vim.system({ "cargo +nightly build --release" }, { cwd = args.path })
			end
		end,
		after = function()
			require("blink-cmp").setup({
				keymap = {
					["<c-f>"] = {},
				},
				completion = {
					list = {
						max_items = 10,
					},
					menu = {
						draw = {
							treesitter = { "lsp" },
							columns = {
								{ "kind_icon" },
								{ "label", "label_description", gap = 1 },
								{ "source_name" },
							},
						},
					},
					documentation = {
						auto_show = true,
					},
				},
				signature = { enabled = true },
				cmdline = {
					enabled = true,
					sources = { "cmdline" },
					completion = { menu = { auto_show = true } },
				},
			})
			require("tabout").setup({})
		end,
	},
})
