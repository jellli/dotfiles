_G.CodeCompanionWinbar = nil
local keymap = Jili.keymap
local later = require("q").later

later(function()
	vim.pack.add({
		"https://github.com/nvim-lua/plenary.nvim",
		"https://github.com/olimorris/codecompanion.nvim",
		"https://github.com/monkoose/neocodeium",
	})

	local function get_op_key(key_name)
		local cache_dir = vim.fn.stdpath("cache") .. "/op_api_keys"
		local cache_file = cache_dir .. "/" .. key_name

		local f = io.open(cache_file, "r")
		if f then
			local cached = f:read("*a")
			f:close()
			if cached and #cached > 0 then
				return vim.trim(cached)
			end
		end

		local obj = vim.system({
			"op",
			"read",
			"op://apikey/" .. key_name .. "/credential",
			"--no-newline",
		}):wait()

		local key = vim.trim(obj.stdout or "")
		if key ~= "" then
			vim.fn.mkdir(cache_dir, "p")
			local wf = io.open(cache_file, "w")
			if wf then
				wf:write(key)
				wf:close()
			end
		end

		return key
	end

	require("codecompanion").setup({
		extensions = {},
		interactions = {
			cmd = {
				adapter = "deepseek",
			},
			inline = {
				adapter = "deepseek",
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
							api_key = function()
								return get_op_key("DEEPSEEK_API_KEY")
							end,
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
							api_key = function()
								return get_op_key("KIMI_CODE_KEY")
							end,
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
							api_key = function()
								return get_op_key("BAILIAN_API_KEY")
							end,
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

	require("neocodeium").setup({
		show_label = false,
		silent = true,
		filetypes = {
			c = false,
			markdown = false,
			zig = false,
		},
	})

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
end)

keymap({ "n", "v" }, "<leader>ac", "<cmd>CodeCompanionActions<cr>", "Code Companion Actions")
keymap({ "n", "v" }, "<leader>aa", "<cmd>CodeCompanionChat Toggle<cr>", "Toggle Code Companion Chat")
keymap("v", "ga", "<cmd>CodeCompanionChat Add<cr>", "Add to Chat")
