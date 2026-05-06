_G.CodeCompanionWinbar = nil
local keymap = Jili.keymap
require("pack").add({
	{
		src = { "https://github.com/nvim-lua/plenary.nvim", "https://github.com/olimorris/codecompanion.nvim" },
		after = function()
			require("codecompanion").setup({
				extensions = {},
				interactions = {
					cmd = {
						adapter = "bailian",
					},
					inline = {
						adapter = "bailian",
					},
					chat = {
						adapter = "deepseek",
					},
				},
				opts = {
					language = "Chinese",
				},
				adapters = {
					http = {
						deepseek = function()
							return require("codecompanion.adapters").extend("openai_compatible", {
								formatted_name = "DeepSeek",
								env = {
									api_key = "cmd:op read op://apikey/DEEPSEEK_API_KEY/credential --no-newline",
									url = "https://api.deepseek.com",
								},
								schema = {
									model = {
										default = "deepseek-v4-pro",
									},
								},
							})
						end,
						kimi = function()
							return require("codecompanion.adapters").extend("openai_compatible", {
								formatted_name = "Kimi",
								env = {
									api_key = "cmd:op read op://apikey/KIMI_CODE_KEY/credential --no-newline",
									url = "https://api.moonshot.cn",
								},
								schema = {
									model = {
										default = "kimi-k2.5",
									},
								},
							})
						end,
						bailian = function()
							return require("codecompanion.adapters").extend("openai_compatible", {
								formatted_name = "Bailian",
								env = {
									api_key = "cmd:op read op://apikey/BAILIAN_API_KEY/credential --no-newline",
									url = "https://dashscope.aliyuncs.com/compatible-mode",
								},
								schema = {
									model = {
										default = "MiniMax-M2.5",
									},
								},
							})
						end,
					},
				},
			})

			keymap({ "n", "v" }, "<leader>ac", function() require("codecompanion").actions({}) end, "Code Companion Actions")
			keymap({ "n", "v" }, "<leader>aa", function() require("codecompanion").toggle() end, "Toggle Code Companion Chat")
			keymap("v", "ga", "<cmd>CodeCompanionChat Add<cr>", "Add to Chat")

			Jili.autocmd("FileType", {
				pattern = "codecompanion",
				callback = function(event)
					local buf = event.buf
					local opt = vim.opt_local
					opt.number = false
					opt.relativenumber = false
					opt.signcolumn = "no"

					_G.CodeCompanionWinbar = function()
						local meta = _G.codecompanion_chat_metadata and _G.codecompanion_chat_metadata[buf]
						if not meta then
							return ""
						end
						return table.concat({
							"%#StatuslineAI#",
							" 󰧑 ",
							"%#StatuslineNC#",
							meta.adapter.formatted_name or meta.adapter.name,
							":",
							"%#StatuslineAI#",
							meta.adapter.model,
							"%*",
							"%=",
							"%#StatuslineNC#",
							meta.tokens,
							" tokens",
							"%*",
						})
					end
					vim.wo.winbar = "%{%v:lua.CodeCompanionWinbar()%}"
				end,
			})
		end,
	},

	{
		src = "https://github.com/monkoose/neocodeium",
		after = function()
			require("neocodeium").setup({
				show_label = false,
				silent = true,
				filetypes = {
					c = false,
					markdown = false,
					zig = false,
				},
			})

			keymap("i", "<C-f>", function() require("neocodeium").accept() end, "Accept suggestion")
			keymap("i", "<A-w>", function() require("neocodeium").accept_word() end, "Accept word")
			keymap("i", "<A-l>", function() require("neocodeium").accept_line() end, "Accept line")
			keymap({ "n", "i" }, "<A-c>", function() require("neocodeium").clear() end, "Clear suggestion")
		end,
	},
})
