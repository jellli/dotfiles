_G.CodeCompanionWinbar = nil
local function load_codecompanion()
	vim.pack.add({
		"https://github.com/nvim-lua/plenary.nvim",
		"https://github.com/olimorris/codecompanion.nvim",
	})
	local opts = {
		extensions = {},
		interactions = {
			cmd = {
				adapter = "bailian",
				model = "minimax-m2.5",
			},
			inline = {
				adapter = "bailian",
				model = "minimax-m2.5",
			},
			chat = {
				adapter = "bailian",
				model = "kimi-k2.5",
			},
		},
		opts = {
			language = "Chinese",
		},
		adapters = {
			http = {
				kimi = function()
					return require("codecompanion.adapters").extend("openai_compatible", {
						formatted_name = "Kimi",
						env = {
							api_key = "KIMI_CODE_KEY",
							url = "https://api.moonshot.cn",
						},
						schema = {
							model = {
								default = "kimi-k2.5",
							},
						},
					})
				end,
				volcengine_coding = function()
					return require("codecompanion.adapters").extend("openai_compatible", {
						formatted_name = "Volcengine Coding",
						env = {
							api_key = "VOLCENGINE_API_KEY",
							url = "https://ark.cn-beijing.volces.com/api/coding",
							chat_url = "/v3/chat/completions",
							models_endpoint = "/v3/models",
						},
						schema = {
							model = {
								default = "kimi-k2.5",
								choices = {
									"doubao-seed-code",
									"kimi-k2.5",
									"glm-4.7",
									"deepseek-v3.2",
									"doubao-seed-2.0-code",
									"doubao-seed-2.0-pro",
									"doubao-seed-2.0-lite",
									"minimax-m2.5",
								},
							},
						},
					})
				end,
				bailian = function()
					return require("codecompanion.adapters").extend("openai_compatible", {
						formatted_name = "Bailian",
						env = {
							api_key = "BAILIAN_API_KEY",
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
		prompt_library = {
			["Commit concise"] = {
				interaction = "chat",
				description = "Generate a conventional commit message without long description.",
				opts = {
					alias = "commit-concise",
					auto_submit = true,
					adapter = {
						name = "copilot",
					},
				},
				prompts = {
					{
						role = "user",
						content = function()
							return string.format(
								[[I want you to create a commit using a concise commit message that follows the conventional commit format. Make sure to:
1. Use only a header (no detailed description).
2. Choose the correct scope based on the changes.
3. Ensure the message is clear, relevant, and properly formatted.

Here is the diff:

```diff
%s
```]],
								vim.fn.system("git diff --no-ext-diff --staged")
							)
						end,
						opts = {
							contains_code = true,
						},
					},
				},
			},
		},
	}

	require("codecompanion").setup(opts)

	local keymap = Jili.keymap

	keymap({ "n", "v" }, "<leader>ac", function()
		require("codecompanion").actions({})
	end, "Code Companion Actions")

	keymap({ "n", "v" }, "<leader>aa", function()
		require("codecompanion").toggle()
	end, "Toggle Code Companion Chat")

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
end

local function load_neocodeium()
	vim.pack.add({
		"https://github.com/monkoose/neocodeium",
	})
	require("neocodeium").setup({
		show_label = false,
		silent = true,
		filetypes = {
			c = false,
			markdown = false,
			zig = false,
		},
	})

	local keymap = Jili.keymap

	keymap("i", "<C-f>", function()
		require("neocodeium").accept()
	end, "Accept suggestion")

	keymap("i", "<A-w>", function()
		require("neocodeium").accept_word()
	end, "Accept word")

	keymap("i", "<A-l>", function()
		require("neocodeium").accept_line()
	end, "Accept line")

	keymap({ "n", "i" }, "<A-c>", function()
		require("neocodeium").clear()
	end, "Clear suggestion")
end

vim.schedule(function()
	load_codecompanion()
	load_neocodeium()
end)
