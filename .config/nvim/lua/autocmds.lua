local keymap = Jili.keymap
local autocmd = Jili.autocmd

local os = vim.fn.has("wsl") == 1 and "WSL"
	or ({ ["OSX"] = "macOS", ["Windows"] = "Windows" })[require("jit").os]
	or "Linux"

local im_cmd = ({
	macOS = { "macism", "com.apple.keylayout.ABC" },
	Windows = { "im-select.exe", "1033" },
	WSL = { "im-select.exe", "1033" },
	Linux = vim.fn.executable("fcitx5-remote") == 1 and { "fcitx5-remote", "-s", "keyboard-us" } or nil,
})[os]

autocmd("FileType", {
	pattern = "*",
	callback = function(ev)
		-- Disable auto-commenting (c, r, o) and enable smart joining (j)
		vim.opt_local.formatoptions:remove({ "c", "r", "o" })
		vim.opt_local.formatoptions:append({ "j" })

		-- Restore cursor position from last exit
		if vim.bo[ev.buf].filetype ~= "gitcommit" then
			vim.cmd('silent! normal! g`"zz')
		end

		-- Close with q
		local q_ft = { "checkhealth", "help", "lspinfo", "qf", "fugitive", "fugitiveblame", "git", "gitsigns-blame", "gitcommit" }
		if vim.tbl_contains(q_ft, ev.match) then
			keymap("n", "q", "<cmd>close<cr>", { buffer = ev.buf, silent = true, nowait = true })
		end
	end,
})

autocmd({ "VimEnter", "VimLeave" }, {
	callback = function()
		if vim.fn.executable("tmux") == 1 then
			vim.system({ "tmux", "rename-window", vim.fn.fnamemodify(vim.fn.getcwd(), ":t") })
		end
	end,
})

if im_cmd then
	autocmd({ "InsertLeave", "CmdlineLeave", "FocusGained" }, {
		callback = function()
			vim.system(im_cmd)
		end,
	})
end
